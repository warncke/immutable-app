'use strict'

/* native modules */
const assert = require('assert')
const debug = require('debug')('immutable-app')
const fs = require('fs')
const path = require('path')

/* npm modules */
const expressHandlebarsMulti = require('express-handlebars-multi')
const ImmutableCoreModel = require('immutable-core-model')
const Promise = require('bluebird')
const _ = require('lodash')
const bodyParser = require('body-parser')
const changeCase = require('change-case')
const cookieParser = require('cookie-parser')
const express = require('express')
const getEnv = require('get-env')
const morgan = require('morgan')

/* constants */

// suported http methods
const httpMethods = {
    delete: true,
    get: true,
    post: true,
    put: true,
}

/* exports */
module.exports = init

/**
 * @function init
 *
 * initialize express app from config
 *
 * @throws {Error}
 */
async function init () {
    // initialize global dir config by merging module configs
    initDir(this.immutableApp)
    // initalize handlebars
    initHandlebars(this.immutableApp)
    // initalize express request handling - bodyParser, cookieParser, etc
    initExpress(this.immutableApp)
    // initialize app
    initApp(this.immutableApp)
    // initialize models
    try {
        await initModels(this.immutableApp)
    }
    catch (err) {
        throw err
    }
    // set initialize flag to true
    this.immutableApp.initialized = true
    // debug
    debug('init', this.immutableApp)
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
    // default dir is app base + dir name
    var defaultDir = base+'/'+name
    // if default dir exists then add it
    try {
        // will throw error if dir does not exists
        fs.statSync(defaultDir)
        // add default dir
        dirs.push(defaultDir)
    }
    // ignore errors
    catch (err) {}
    // get only the directories that exist
    config.dir[name] = _.filter(dirs, dir => {
        // if dir is relative then get abs from base
        if (!path.isAbsolute(dir)) {
            // get abs path from base and dir
            dir = base+'/'+dir
        }
        // stat dir
        try {
            var stat = fs.statSync(dir)
        }
        // throw error
        catch (err) {
            throw new Error(name+' dir error: '+err.message)
        }
        // debug
        debug('get dir %s: %s', name, stat ? dir : 'error')
        // return dir if exists or undefined
        return stat ? true : false
    })
    // return directories
    return config.dir[name]
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
    // init each module in the order loaded
    _.each(config.moduleNames, moduleName => {
        var module = config.modules[moduleName]
        // load modules and controllers for module, setup routes
        initModule(config, module)
    })
}

/**
 * @function initAppDir
 *
 * recursively initialize each app dir and all sub-dirs
 *
 * @param {object} config
 * @param {object} module
 * @param {string} appDir
 * @param {string} appSubDir
 *
 * @throws {Error}
 */
function initAppDir (config, module, appDir, appSubDir) {
    // if called without sub dir then start with app dir
    if (!appSubDir) {
        appSubDir = appDir
    }
    // debug
    debug('initAppDir %s', appSubDir)
    // get relative path from app base to directory which determines
    // where in the routes tree this directory sits
    var rel = path.relative(appDir, appSubDir)
    // get route node from relative path
    var route = routeFromRel(module.routes, rel)
    // if route node has already been loaded then return to prevent
    // infinite loops - note that the limit on recursion is based on the
    // app route mapping and not the actual filesystem mapping so that
    // the same directory on the filesystem can be mouted in multiple places
    // in the app through the use of symlinks
    if (route.loaded) {
        return
    }
    // directory names map
    var dirNames = {}
    // list of all sub-directories in directory
    var dirs = []
    // list of all files in directory
    var files = []
    // iterate over file names in directory
    _.each(fs.readdirSync(appSubDir), file => {
        // get absolute file
        var absFile = appSubDir+'/'+file
        // get stat of file to check if it is dir or file
        var stat = fs.statSync(absFile)
        // file
        if (stat.isFile()) {
            files.push(absFile)
        }
        // directory
        else if (stat.isDirectory()) {
            // add name to map for doing conflict checking
            dirNames[file] = true
            // add abs path to list for recursive loading
            dirs.push(absFile)
        }
        // ignore anything else
        else {
            debug('initAppDir: ignoring %s', absFile)
        }
    })

    // regular expression for matching controller files
    var controllerRegEx = /controller\.js$/
    // regular expression for matching model files
    var modelRegEx = /model\.js$/
    // regular expression for matching template files extname starts with .
    var templateRegEx = new RegExp('\\'+config.handlebars.ext+'$')

    // controller functions indexed by name. for a particular route there may
    // be multiple paths (e.g. index (/), /foo, etc) and each path can have
    // multiple http methods operating on it. controller functions must be
    // named like: getIndex, postFoo, etc. controller names must not conflict
    // with sub-directories.
    route.controllers = {}
    // immutable model module - there can only be one model file and it
    // must export an immutable-core-model
    route.model
    // list of templates indexed by name. name of template file indicates path
    // that it should be served on. if path does not have a controller then
    // a default controller will be created.
    route.templates = {}

    // require all controller and model files for route
    _.each(files, file => {
        // get type
        var type
        // controllers must be named controller.js
        if (file.match(controllerRegEx)) {
            // require controller file
            var controller = require(path.relative(__dirname, file))

        }
        // models must be named model.js
        else if (file.match(modelRegEx)) {
            // do not allow multiple model files
            assert.ok(!route.model, file+': mutliple models for route not allowed '+file)
            // require model file
            route.model = require(path.relative(__dirname, file))
            // require ImmutableCoreModel
            assert.ok(ImmutableCoreModel.looksLike(route.model), file+': must export ImmutableCoreModel')
            // add model to map of all app models
            config.models[route.model.name] = route.model
        }
        // template files must end in hbs
        else if (file.match(templateRegEx)) {
            // get only the file name
            file = path.basename(file)
            // remove extension from file
            file = file.replace(templateRegEx, '')
            // template path used in render call is relative path from app
            // base (if any) and the file name without the extensions
            var templatePath = (rel.length ? rel+'/' : '') + file
            // store template name and template path
            route.templates[file] = templatePath
        }
        // otherwise ignore file
        else {
            return
        }
    })

    // create controllers for any template files that do not have them
    _.each(route.templates, (path, name) => {
        // controller name for tempate is getTemplateName
        var controllerName = 'get'+changeCase.pascalCase(name)
        // if controller exists do not create default
        if (route.controllers[controllerName]) {
            return
        }
        // create default controller which doesn't do anything
        route.controllers[controllerName] = async function () {}
    })

    // create routes for controllers
    _.each(route.controllers, (controller, name) => {
        // extract method and path from controller - method is lower case
        // followed by capitalized path
        var [undefined, method, path] = name.match(/^([a-z]+)(.*)$/)
        // get path with multiple words separated by dash
        path = changeCase.paramCase(path)
        // use path as template name
        var templateName = path
        // convert the name index to emptry string which will have / prepended
        if (path === 'index') {
            path = ''
        }
        // do not allow name conflicts between controller paths and sub-dirs
        assert.ok(!dirNames[path], 'controller path '+path+' conflicts with directory')
        // require valid http method
        assert.ok(httpMethods[method], 'invalid http method '+method)
        // create express router for route node if it does not exist
        if (!route.router) {
            route.router = express.Router()
        }
        // add path to router with method
        route.router[method]('/'+path, function (req, res) {
            // TODO: arg handling, etc

            // call controller function which returns a promise
            controller()
            // when controller resolves render template
            .then(data => {
                // TODO: data processing
                res.render(route.templates[templateName], data)
            })
            .catch(err => {
                console.error(err)
            })
        })

    })

    // mark route as loaded
    route.loaded = true
    // recursively process all sub-directories
    _.each(dirs, dir => {
        initAppDir(config, module, appDir, dir)
    })

    // and any sub-routes to router
    _.each(route.routes, (subRoute, name) => {
        // if sub-route has a router then add
        if (subRoute.router) {
            route.router.use('/'+name, subRoute.router)
        }
    })

    // if this is the route route node then add it to the express app
    if (route.root) {
        // require router
        assert.ok(route.router, 'no routes defined for app root')
        // set router
        config.express.use('/', route.router)
    }
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
            // debug
            debug('initDir %s %s', moduleName, dirName, moduleDirs)
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
    // add logger
    config.express.use(morgan(getEnv() === 'prod' ? 'combined' : 'dev'))
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
        ext: config.handlebars.ext,
        helpers: config.handlebars.helpers,
        layoutDirs: _.reverse(config.dir.layouts),
        partialDirs: _.reverse(config.dir.partials),
    }
    // debug handlebars config
    debug('init handlebars:', handlebarsConfig)
    // create new express handlebars engine
    var engine = expressHandlebarsMulti(handlebarsConfig)
    // configure express
    config.express.engine(config.handlebars.ext, engine)
    config.express.set('view engine', config.handlebars.ext)
    // views can be in specific views directories or in apps directories
    var viewsDir = config.dir.views
    var appDir = config.dir.app
    // app directory is also the primary views directory use the reverse
    // so that local app directories override modules and defaults
    config.express.set('views', _.reverse(appDir.concat(viewsDir)))
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

/**
 * @function initModels
 *
 * assign database drivers to models and sync models
 *
 * @param {object} config
 *
 * @returns {Promise}
 *
 * @throws {Error}
 */
async function initModels (config) {
    // iterate over models
    return Promise.each(_.values(config.models), model => {
        // if model does not have a database then add from app config
        if (!model.databaseObj) {
            // get database for model
            var database = config.database[model.name] || config.database.default
            // require database
            assert.ok(database, 'database not found for model '+model.name)
            // set database for model
            model.database(database)
        }
        // sync model
        return model.sync()
    })
}

/**
 * @function initModule
 *
 * load modules and controllers for module, setup routes
 *
 * @param {object} config
 * @param {object} module
 *
 * @throws {Error}
 */
function initModule (config, module) {
    // recursively load app dir(s)
    _.each(module.dir.app, appDir => {
        initAppDir(config, module, appDir)
    })
}

/**
 * @function routeFromRel
 *
 * get route node based on rel path
 *
 * @param {object} route
 * @param {string} rel
 *
 * @returns {object}
 */
function routeFromRel (route, rel) {
    // if rel is empty string then this is route
    if (rel.length === 0) {
        // set root flag on route
        route.root = true
        // return route
        return route
    }
    // if rel is above root this is error
    assert.ok(!rel.match(/^\./), 'relative path above app root: '+rel)
    // split rel into directories
    var dirs = rel.split('/')
    // get next route node for each dir in rel path
    _.each(dirs, dir => {
        // create sub node if it does not exists
        if (!route.routes) {
            route.routes = {}
        }
        // create new entry for dir if it does not exist
        if (!route.routes[dir]) {
            route.routes[dir] = {}
        }
        // switch context
        route = route.routes[dir]
    })
    // return resolved route
    return route
}