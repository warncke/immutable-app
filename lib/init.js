'use strict'

/* native modules */
const debug = require('debug')('immutable-app')
const fs = require('fs')
const path = require('path')

/* npm modules */
const ExpressHandlebars  = require('express-handlebars')
const _ = require('lodash')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const getEnv = require('get-env')
const logger = require('morgan')

/* exports */
module.exports = init

/**
 * @function init
 *
 * initialize express app from config
 *
 * @param {object} config
 * @param {object} defaultConfig
 *
 * @throws {Error}
 */
function init (config, defaultConfig) {
    // debug
    debug('init', config)
    // initalize handlebars
    initHandlebars(config, defaultConfig)
    // initalize express request handling - bodyParser, cookieParser, etc
    initExpress(config, defaultConfig)
}

/* private functions */

/**
 * @function getDir
 *
 * takes name of diretory (e.g. app, assets) as argument and returns array
 * of directories from config and the default directory (base/name) if they
 * exist
 *
 * @param {object} config
 * @param {string} name
 *
 * @returns {array|undefined} 
 */
function getDir (config, name) {
    var base = config.base
    // get list of directories for name
    var dirs = config.dir[name]
    // make sure dirs is array
    if (!Array.isArray(dirs)) {
        dirs = dirs
    }
    // add default directory to dirs
    dirs.push(base+'/'+name)
    // get only the directories that exist
    return _.filter(dirs, dir => {
        // if dir is relative then get abs from base
        if (!path.isAbsolute(dir)) {
            // get abs path from base and dir
            dir = base+'/'+dir
        }
        // stat dir
        try {
            var stat = fs.statSync(dir)
        }
        // ignore errors
        catch (err) {}
        // debug
        debug('get dir %s: %s', name, stat ? dir : 'error')
        // return dir if exists or undefined
        return stat ? true : false
    })
}

/**
 * @function initExpress
 *
 * initalize express request handling - bodyParser, cookieParser, etc
 *
 * @param {object} config
 * @param {object} defaultConfig
 *
 * @throws {Error}
 */
function initExpress (config, defaultConfig) {
    // get list of assets dirs to use
    var assetsDirs = getDir(config, 'assets')
    // add each assets dir in reverse order which allows assets from modules
    // to be overridden by app
    _.each(_.reverse(assetsDirs, dir => {
        config.express.use('/assets', express.static(dir))
    }))
    // disable x-powered-by header
    config.express.disable('x-powered-by')
    // parse json
    config.express.use(bodyParser.json())
    // parse application/x-www-form-urlencoded
    config.express.use(bodyParser.urlencoded({
        extended: false
    }))
    // parse cookies
    config.express.use(cookieParser())
    // use any additional middleware set in config
    _.each(config.use, use => {
        // if use value is array then use array as args
        if (_.isArray(use)) {
            config.express.use.apply(config.express, use)
        }
        // otherwise value should be function
        else {
            config.express.use(use)
        }
    })
}

/**
 * @function initHandlebars
 *
 * @param {object} config
 * @param {object} defaultConfig
 *
 * @throws {Error}
 */
function initHandlebars (config, defaultConfig) {
    // load any helpers in the helpers directory
    initHandlebarsHelpers(config, defaultConfig)
    // hadlebars config - use reverse of dir list so that local app files
    // override modules and defaults
    var handlebarsConfig = {
        defaultLayout: config.handlebars.defaultLayout,
        extname: config.handlebars.extname,
        helpers: config.handlebars.helpers,
        layouts: _.reverse(getDir(config, 'layouts')),
        partials: _.reverse(getDir(config, 'partials')),
    }
    // debug handlebars config
    debug('init handlebars:', handlebarsConfig)
    // create new express handlebars instance
    var expressHandlebars = ExpressHandlebars.create(config.handlebars)
    // configure express
    config.express.engine('handlebars', expressHandlebars.engine)
    config.express.set('view engine', 'handlebars')
    // views can be in specific views directories or in apps directories
    var viewsDir = getDir(config, 'views').concat()
    var appDir = getDir(config, 'app')
    // app directory is also the primary views directory use the reverse
    // so that local app directories override modules and defaults
    config.express.set('views', _.reverse(viewsDir.concat(appDir)))
}

/**
 * @function initHandlebarsHelpers
 *
 * load any helpers in the helpers directory
 *
 * @param {object} config
 * @param {object} defaultConfig
 *
 * @throws {Error}
 */
function initHandlebarsHelpers (config, defaultConfig) {
    // get helpers dir
    var helpersDirs = getDir(config, 'helpers')
    // load files from each helpers dir
    _.each(helpersDirs, helpersDir => {
        // get directory listing
        try {
            var files = fs.readdirSync(helpersDir)
        }
        // ignore errors
        catch (err) {
            debug('init helpers readdir:', err)
        }
        // load any js files
        _.each(files, file => {
            // get relative path
            var relPath = path.relative(__dirname, helpersDir)
            // add relative path to file for require
            file = relPath+'/'+file
            // skip file if it does not have js extension
            if (!file.match(/js$/)) {
                debug('init helpers: skipping file %s', file)
                return
            }
            debug('init helpers: require %s/%s', __dirname, file)
            // require abs version of file - this will throw error
            var module = require(file)
            // iterate over module and add any functions to helpers
            _.each(module, (func, name) => {
                // add helper if function
                if (typeof func == 'function') {
                    debug('init helpers: added helper %s', name)
                    // add helper
                    config.handlebars.helpers[name] = func
                }
                // skip if not a function
                else {
                    debug('init helpers: skipping %s - not a function', name)
                }
                
            })
        })
    })
}