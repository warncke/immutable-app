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
 * @throws {Error}
 */
function init () {
    // initialize global dir config by merging module configs
    initDir(this.immutableApp)
    // initalize handlebars
    initHandlebars(this.immutableApp)
    // initalize express request handling - bodyParser, cookieParser, etc
    initExpress(this.immutableApp)
    // initialize app
    initApp(this.immutableApp)
    // set initialize flag to true
    this.immutableApp.initialized = true
    // debug
    //debug('init', this.immutableApp)
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
 * @function initApp
 *
 * initialize app routes from app directory(s)
 *
 * @param {object} config
 *
 * @throws {Error}
 */
function initApp (config) {
    
}

/**
 * @function initDir
 *
 * initialize global dir config by merging module configs
 *
 * @param {object} config
 *
 * @throws {Error}
 */
function initDir (config) {
    // create global dir config
    config.dir = {
        assets: [],
        app: [],
        helpers: [],
        layouts: [],
        partials: [],
        views: [],
    }
    // iterate over modules getting and merging directories for each
    _.each(config.moduleNames, moduleName => {
        // get module
        var module = config.modules[moduleName]
        // iterate over dir configs
        _.each(config.dir, (dirs, dirName) => {
            // get directories for module
            var moduleDirs = getDir(module, dirName)
            // add module dirs to config
            _.each(moduleDirs, moduleDir => config.dir[dirName].push(moduleDir))
        })
    })
    // debug merged dirs
    debug('initDir', config.dir)
}


/**
 * @function initExpress
 *
 * initalize express request handling - bodyParser, cookieParser, etc
 *
 * @param {object} config
 *
 * @throws {Error}
 */
function initExpress (config) {
    // add each assets dir in reverse order which allows assets from modules
    // to be overridden by app
    _.each(_.reverse(config.dir.assets, dir => {
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
 *
 * @throws {Error}
 */
function initHandlebars (config) {
    // load any helpers in the helpers directory
    initHandlebarsHelpers(config)
    // hadlebars config - use reverse of dir list so that local app files
    // override modules and defaults
    var handlebarsConfig = {
        defaultLayout: config.handlebars.defaultLayout,
        extname: config.handlebars.extname,
        helpers: config.handlebars.helpers,
        layouts: _.reverse(config.dir.layouts),
        partials: _.reverse(config.dir.partials),
    }
    // debug handlebars config
    debug('init handlebars:', handlebarsConfig)
    // create new express handlebars instance
    var expressHandlebars = ExpressHandlebars.create(config.handlebars)
    // configure express
    config.express.engine('handlebars', expressHandlebars.engine)
    config.express.set('view engine', 'handlebars')
    // views can be in specific views directories or in apps directories
    var viewsDir = config.dir.views
    var appDir = config.dir.app
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
 *
 * @throws {Error}
 */
function initHandlebarsHelpers (config) {
    // get helpers dir
    var helpersDirs = config.dir.helpers
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