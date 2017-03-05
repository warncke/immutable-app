'use strict'

/* native modules */
const assert = require('assert')
const debug = require('debug')('immutable-app')
const fs = require('fs')
const path = require('path')

/* npm modules */
const expressHandlebarsMulti = require('express-handlebars-multi')
const ImmutableCoreController = require('immutable-core-controller')
const ImmutableCoreModel = require('immutable-core-model')
const Promise = require('bluebird')
const _ = require('lodash')
const bodyParser = require('body-parser')
const changeCase = require('change-case')
const cookieParser = require('cookie-parser')
const express = require('express')
const getEnv = require('get-env')
const handlebarsHelpers = require('handlebars-helpers')
const morgan = require('morgan')
const randomUniqueId = require('random-unique-id')
const stackTrace = require('stack-trace')

/* app modules */
const ImmutableAppPresenter = require('./immutable-app-presenter')
const setCookie = require('./set-cookie')

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
 * @returns {Promise}
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
    // add error handler after all other middleware and routers
    initErrorHandler(this.immutableApp)
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
    // prevent infinite loops
    if (route.loaded) {
        return
    }
    // mark route as loaded
    route.loaded = true
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
    // create express router for route
    route.router = express.Router({
        caseSensitive: true,
        strict: true,
    })
    // recursively process all sub-directories - go depth first so that routes
    // for sub-dirs are added before wildcard path param matching rules
    _.each(dirs, dir => {
        initAppDir(config, module, appDir, dir)
    })
    // and any sub-routes to router
    _.each(route.routes, (subRoute, name) => {
        // if sub-route has a router then add
        if (subRoute.router) {
            route.router.use('/'+name+'/', subRoute.router)
        }
    })
    // regular expression for matching controller files
    var controllerRegEx = /controller\.js$/
    // regular expression for matching model files
    var modelRegEx = /model\.js$/
    // regular expression for matching template files extname starts with .
    var templateRegEx = new RegExp('\\'+config.handlebars.ext+'$')
    // immutable model module - there can only be one model file and it
    // must export an immutable-core-model
    route.model
    // list of templates indexed by name. name of template file indicates path
    // that it should be served on. if path does not have a controller then
    // a default controller will be created.
    route.templates = {}
    // get mapping of templates by path
    route.templatesInverse = {}
    // argument to pass when instantiating controller
    var controllerArgs = {
        paths: {},
    }
    // require all controller and model files for route
    _.each(files, file => {
        // get type
        var type
        // controllers must be named controller.js
        if (file.match(controllerRegEx)) {
            // get default path name from file
            var pathName = file.replace(controllerRegEx, '')
            // require controller file
            var controller = require(path.relative(__dirname, file))
            // merge imported spec to controller args
            _.merge(controllerArgs, controller)
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
            // split file name on dot - if template name has a dot then the
            // part after the dot must be the role that the template is for
            var fileParts = file.split('.')
            // if there is only a single part then not a role specific template
            if (fileParts.length === 1) {
                // if entry does not exist for template name then create it
                if (!route.templates[file]) {
                    route.templates[file] = {
                        role: {},
                    }
                }
                // store template name and template path under default all role
                route.templates[file].role.all = templatePath
                // create inverse entry keyed by full path
                route.templatesInverse[templatePath] = {
                    name: file,
                    role: 'all',
                }
            }
            // it there are two parts they must be name.role
            else if (fileParts.length === 2) {
                // if entry does not exist for template name then create it
                if (!route.templates[fileParts[0]]) {
                    route.templates[fileParts[0]] = {
                        role: {},
                    }
                }
                // store template name and template path
                route.templates[fileParts[0]].role[fileParts[1]] = templatePath
                // create inverse entry keyed by full path
                route.templatesInverse[templatePath] = {
                    name: fileParts[0],
                    role: fileParts[1],
                }
            }
            // if there are not 1 or 2 parts this is an error
            else {
                throw new Error('invalid template file name '+file)
            }
        }
        // otherwise ignore file
        else {
            return
        }
    })
    // get controller name as app + path
    var controllerName = changeCase.camelCase(module.name)
        +changeCase.pascalCase(rel.length ? rel : 'Index')
    // set controller args
    controllerArgs.model = route.model
    controllerArgs.name = controllerName
    controllerArgs.path = rel
    // immutable controller module - this will be build from functions exported
    // by controller files, controller functions created automatically for
    // template files without controllers, and controller functions created
    // automatically for model (if any)
    var controller = route.controller = new ImmutableCoreController(controllerArgs)
    // get all templates then remove those that have controllers
    var bareTemplates = _.clone(route.templates)
    // iterate over paths
    _.each(controller.paths, path => {
        // iterate over http methods for path
        _.each(path, methods => {
            // iterate over handlers for different roles
            _.each(methods, spec => {
                // role can be specific or default to all
                var role = spec.role || 'all'
                // template can be specified or take from method name
                var template = spec.template || spec.methodName
                // template name exists locally
                if (route.templates[template]) {
                    // template has a controller so remove from list
                    delete bareTemplates[template].role[role]
                }
                // template path exists locally
                if (route.templatesInverse[template]) {
                    // template has a controller so remove from list
                    delete bareTemplates[route.templatesInverse[template].name].role[route.templatesInverse[template].role]
                }
            })
        })
    })
    // set to true if any controllers addded
    var added = false
    // create paths for any templates without controllers
    _.each(bareTemplates, (template, templateName) => {
        // iterate over any templates for roles that have not been used
        _.each(template.role, (templatePath, role) => {
            // get path from template name with index becoming /
            var path = templateName === 'index' ? '/' : '/'+templateName
            // create entry for path in controller if not yet defined
            if (!controller.paths[path]) {
                controller.paths[path] = {}
            }
            // create entry for method if not yet defined
            if (!controller.paths[path]['get']) {
                controller.paths[path]['get'] = []
            }
            // add spec for template to controller
            controller.paths[path]['get'].push({
                role: role,
                template: templatePath,
            })
        })
    })
    // if controllers were added then need to reorder controllers
    if (added) {
        controller.orderControllers()
    }
    // get list of path names
    var pathNames = _.keys(controller.paths)
    // sort path names so that static names go above onces with placeholders
    var sortedPathNames = pathNames.sort(sortPlaceholdersLower)
    // create routes for controller paths
    _.each(sortedPathNames, path => {
        var methods = controller.paths[path]
        // do not allow name conflicts between controller paths and sub-dirs
        assert.ok(!dirNames[path], 'controller path '+path+' conflicts with directory')
        // add route for each method
        _.each(methods, (spec, method) => {
            // add path to router with method
            route.router[method](path, new ImmutableAppPresenter({
                config: config,
                method: method,
                module: module,
                path: path,
                route: route,
                spec: spec,
            }))
        })
    })
    // if this is the route route node then add it to the express app
    if (route.root) {
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
        assets: [__dirname+'/assets'],
        app: [],
        helpers: [],
        layouts: [__dirname+'/layouts'],
        partials: [__dirname+'/partials'],
        views: [__dirname+'/views'],
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
 * @function initErrorHandler
 *
 * add error handler furnction
 *
 * @param {object} config
 *
 * @throws {Error}
 */
function initErrorHandler (config) {
    // set true if in production
    var isProd = getEnv() === 'prod' ? true : false
    // add error handler
    config.express.use(function(error, req, res, next) {
        // whether or not response will be JSON
        var json = req.query.json === '1' || req.query.json === 'true' || (req.xhr && req.query.json !== '0' && req.query.json !== 'false') ? true : false
        // if error contains cookies then set cookies with response
        if (error.cookies) {
            // set cookies
            _.each(error.cookies, (value, name) => {
                setCookie(name, res, value)
            })
        }
        // get http code from error code
        var code = error.code
        // if code is not between 300 and 500 then set to 500
        if (!(code >= 300 && code <= 500)) {
            code = 500
        }
        // json response is expected
        if (json) {
            // code is for redirect
            if (code === 301 || code === 302) {
                res.json({
                    code: code,
                    redirect: true,
                    url: error.url,
                })
            }
            // if error is 409 conflict data should be current instance
            else if (code === 409) {
                // set http status code
                res.status(code)
                // send current instance data
                res.json(error.data)
            }
            // code is other error
            else {
                // get message
                var message = error.message || 'Unknown error'
                // build response
                var resData = {
                    error: message,
                    code: code,
                    data: error.data,
                }
                // add stack if in dev
                if (!isProd) {
                    resData.stack = error.stack.split("\n")
                }
                // set http status code
                res.status(code)
                // send current instance data
                res.json(resData)
            }
        }
        // html response is expected
        else {
            // code is for redirect
            if (code === 301 || code === 302) {
                res.redirect(code, error.url)
            }
            // code is error
            else {
                // set http status code
                res.status(code)
                // render error page
                res.render('error', {
                    error: error,
                    isProd: isProd,
                })
            }
        }
    })
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
    // disable x-powered-by header
    config.express.disable('x-powered-by')
    // enable strict (trailing-slashes) and case-sensitive routing
    config.express.enable('strict routing')
    config.express.enable('case sensitive routing')
    // add each assets dir in reverse order which allows assets from modules
    // to be overridden by app
    _.each(_.reverse(config.dir.assets), dir => {
        config.express.use('/assets', express.static(dir))
    })
    // add requestId and requestCreateTime to req object
    config.express.use(requestIdMiddleware)
    // parse json
    config.express.use(bodyParser.json())
    // parse application/x-www-form-urlencoded
    config.express.use(bodyParser.urlencoded({
        extended: true,
    }))
    // parse cookies
    config.express.use(cookieParser())
    // add logger
    if (config.log) {
        config.express.use(morgan(getEnv() === 'prod' ? 'combined' : 'dev'))
    }
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
    // load handlebars-helpers helper library if flag set
    if (config.handlebarsHelpers) {
        config.handlebars.helpers = handlebarsHelpers()
    }
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
 */
function initModels (config) {
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
 * @function initPath
 *
 * add path config to paths
 *
 * @param {string} method
 * @param {object} path
 * @param {object} paths
 * @param {function|object} spec
 *
 * @throws {Error}
 */
function initPath (method, path, paths, spec) {
    // console.log(method, path, paths, spec)
}

/**
 * @function requestIdMiddleware
 *
 * express middleware to add requestId and requestCreateTime to the req object
 *
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
function requestIdMiddleware (req, res, next) {
    // get unique id object
    var uniqueId = randomUniqueId()
    // add data to req
    req.requestId = uniqueId.id
    req.requestCreateTime = uniqueId.timestamp
    // continue
    next()
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

var placeholderRegExp = new RegExp(/:/)

function sortPlaceholdersLower (a, b) {
    var aPlaceholder = a.match(placeholderRegExp)
    var bPlaceholder = b.match(placeholderRegExp)
    // if both contain placeholders then sort the same
    if (aPlaceholder && bPlaceholder) {
        return 0
    }
    // if a contains placeholder then move it down
    if (aPlaceholder) {
        return 1
    }
    // if b contains placeholder and not a then move a up
    if (bPlaceholder) {
        return -1
    }
    // neither contain placeholder - do not change order
    return 0
}