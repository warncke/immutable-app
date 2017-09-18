'use strict'

/* native modules */
const assert = require('assert')
const debug = require('debug')('immutable-app')
const fs = require('fs')
const path = require('path')
const util = require('util')

/* npm modules */
const ImmutableAccessControl = require('immutable-access-control')
const ImmutableCoreController = require('immutable-core-controller')
const ImmutableCoreModel = require('immutable-core-model')
const ImmutableCoreService = require('immutable-core-service')
const Promise = require('bluebird')
const StackUtils = require('stack-utils')
const _ = require('lodash')
const bodyParser = require('body-parser')
const callsites = require('callsites')
const changeCase = require('change-case')
const cookieParser = require('cookie-parser')
const defined = require('if-defined')
const express = require('express')
const expressHandlebarsMulti = require('express-handlebars-multi')
const getEnv = require('get-env')
const handlebarsHelpers = require('handlebars-helpers')
const morgan = require('morgan')
const randomUniqueId = require('random-unique-id')
const winston = require('winston')

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

const internals = StackUtils.nodeInternals()

internals.push(/bluebird\/js/)
internals.push(/node_modules\/express/)
internals.push(/node_modules\/lodash/)
internals.push(/node_modules\/mariasql/)
internals.push(/Immutable[^.]+\.assert/)
internals.push(/Immutable[^.]+\.error/)

// stack cleaner
const stackUtils = new StackUtils({
    cwd: process.cwd(),
    internals: internals,
})

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
    // initialze logging
    initLogging(this.immutableApp)
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
    await initModels(this.immutableApp)
    // initialize services after models since they may use models
    await initServices(this.immutableApp)
    // set initialize flag to true
    this.immutableApp.initialized = true
    // debug
    debug('init', this.immutableApp)
}

/* private functions */

/**
 * @function formatArgs
 *
 * format arguments for winston logger
 *
 * @param {array} args
 *
 * @returns {array}
 */
function formatArgs (args) {
    return [util.format.apply(util.format, Array.prototype.slice.call(args))];
}

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
        // merge module routes to global routes
        _.merge(config.routes, module.routes)
    })
    // initialize merged routes from all modules
    var router = initRoutes(config, config.routes)
    // bind router to app base
    config.express.use('/', router)
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
    // recursively process all sub-directories - go depth first so that routes
    // for sub-dirs are added before wildcard path param matching rules
    _.each(dirs, dir => {
        initAppDir(config, module, appDir, dir)
    })
    // regular expression for matching controller files
    var controllerRegEx = /controller\.js$/
    // regular expression for matching model files
    var modelRegEx = /model\.js$/
    // regular expression for matching template files extname starts with .
    config.handlebars.templateRegExp = new RegExp('\\'+config.handlebars.ext+'$')
    // ImmutableCoreController for node - multiple files will be merged
    route.controller = {}
    // ImmutableCoreModel for node - multiple files will be merged
    route.model = {}
    // list of templates indexed by name. name of template file indicates path
    // that it should be served on. if path does not have a controller then
    // a default controller will be created.
    route.templates = {}
    // get mapping of templates by path
    route.templatesInverse = {}
    // require all controller and model files for route
    _.each(files, file => {
        // get type
        var type
        // controllers must be named controller.js
        if (file.match(controllerRegEx)) {
            // require controller file
            var controller = require(path.relative(__dirname, file))
            // require defined
            assert.ok(defined(controller), `nothing exported for ${file}`)
            // throw error if controller instantiated
            assert.ok(!controller.ImmutableCoreController, `controller must be plain object ${file}`)
            // merge controller spec
            _.merge(route.controller, controller)
        }
        // models must be named model.js
        else if (file.match(modelRegEx)) {
            // require model file
            var model = require(path.relative(__dirname, file))
            // require defined
            assert.ok(defined(model), `nothing exported for ${file}`)
            // throw error if controller instantiated
            assert.ok(!model.ImmutableCoreModel, `model must be plain object ${file}`)
            // merge model spec
            _.merge(route.model, model)
        }
        // template files must end in hbs
        else if (file.match(config.handlebars.templateRegExp)) {
            // get only the file name
            file = path.basename(file)
            // remove extension from file
            file = file.replace(config.handlebars.templateRegExp, '')
            // template path used in render call is relative path from app
            // base (if any) and the file name without the extensions
            var templatePath = (rel.length ? rel+'/' : '') + file
            // split file name on dot - if template name has a dot then the
            // part after the dot must be the role that the template is for
            var fileParts = file.split('.')
            // if there is only a single part then not a role specific template
            if (fileParts.length === 1) {
                // if entry does not exist for template name then create it
                if (!defined(route.templates[file])) {
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
                var name = fileParts[0]
                var role = fileParts[1]
                // if entry does not exist for template name then create it
                if (!defined(route.templates[name])) {
                    route.templates[name] = {
                        role: {},
                    }
                }
                // store template name and template path
                route.templates[name].role[role] = templatePath
                // create inverse entry keyed by full path
                route.templatesInverse[templatePath] = {
                    name: name,
                    role: role,
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
    // if controller name is not set construct from module name
    if (!defined(route.controller.name)) {
        // get controller name as app + path
        route.controller.name = changeCase.camelCase(module.name)
            + changeCase.pascalCase(rel.length ? rel : 'Index')
    }
    // if controller path is not set use current relative path
    if (!defined(route.controller.path)) {
        route.controller.path = rel
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
        helpers: [__dirname+'/helpers'],
        layouts: [__dirname+'/layouts'],
        partials: [__dirname+'/partials'],
        services: [],
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
        // error must be object with stack
        if (typeof error !== 'object' || typeof error.stack !== 'string') {
            error = new Error(error)
        }
        // whether or not response will be JSON
        var json = req.query.json === '1' || req.query.json === 'true' || (req.xhr && req.query.json !== '0' && req.query.json !== 'false') ? true : false
        // set clean stack
        if (defined(stackUtils)) {
            error.stack = stackUtils.clean(error.stack)
        }
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
            code = error.code = 500
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
                    resData.stack = error.stack.split('\n')
                    // remove last element from stack which is empty
                    resData.stack.pop()
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
                // create pretty printed json data
                if (error.data) {
                    error.prettyData = JSON.stringify(error.data, null, 4)
                }
                // build data for error template
                var data = {
                    error: error,
                    production: isProd,
                    session: req.session,
                }
                // add assets to template data
                _.merge(data, config.assets)
                // render error page
                res.render('error', data)
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
            file = `./${relPath}/${file}`
            // skip file if it does not have js extension
            if (!file.match(/\.js$/)) {
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
 * @function initLogging
 *
 * replace console.log, console.error, etc with custom loggers
 *
 * @param {object} config
 */
function initLogging (config) {
    // only create logger if custom logging enabled
    if (config.logger !== true) {
        return
    }
    // create new logger instance
    var logger = new winston.Logger()
    // add transport
    logger.add(winston.transports.Console, {
        formatter: winstonFormatter,
        level: 'info'
    });
    // make logger accessible
    config.logger = logger
    // override console.log function
    console.log = function () {
        logger.info.apply(logger, formatArgs(arguments))
    }
    // override console.info function
    console.info = function () {
        logger.info.apply(logger, formatArgs(arguments))
    }
    // override console.warn function
    console.warn = function () {
        logger.warn.apply(logger, formatArgs(arguments))
    }
    // override console.error function
    console.error = function () {
        logger.error.apply(logger, formatArgs(arguments))
    }
    // override console.debug function
    console.debug = function () {
        logger.debug.apply(logger, formatArgs(arguments))
    }
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
        if (!defined(model.databaseObj)) {
            // get database for model
            var database = config.database[model.name] || config.database.default
            // require database
            assert.ok(database, 'database not found for model '+model.name)
            // set database for model
            model.database(database)
        }
        // if model does not have redis add
        if (!defined(model.cache)) {
            // get redis client for model
            var redis = config.redis[model.name] || config.redis.default
            // redis is optional
            if (defined(redis)) {
                model.redis(redis)
            }
        }
        // sync model unless NO_SYNC env flag set
        if (!process.env.NO_SYNC) {
            return model.sync()
        }
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
 * @function initRoutes
 *
 * initialize merged route configurations
 *
 * @param {object} config
 * @param {object} route
 *
 * @throws {Error}
 */
function initRoutes (config, route) {
    // create express router for route
    route.router = express.Router({
        caseSensitive: true,
        strict: true,
    })
    // initialize routes depth first so that explicit nested paths come
    // before wildcard paths and are handled correctly by express router
    _.each(route.routes, (subRoute, path) => {
        // get router for sub route
        var router = initRoutes(config, subRoute)
        // bind route for path
        route.router.use('/'+path+'/', router)
    })
    // clear model if no properties are set
    if (_.keys(route.model).length === 0) {
        route.model = undefined
    }
    // clear controller if no properties are set
    if (_.keys(route.controller).length === 0) {
        route.controller = undefined
    }
    // instantiate ImmutableCoreModel
    if (defined(route.model)) {
        route.model = new ImmutableCoreModel(route.model)
        // add model to app register
        config.models[route.model.name] = route.model
    }
    // if model is not set use model for this node
    if (defined(route.controller) && !defined(route.controller.model)) {
        route.controller.model = route.model
    }
    // instantiate ImmutableCoreController - this will create default controllers
    // for model
    var controller = route.controller = new ImmutableCoreController(route.controller)
    // get all templates then remove those that have controllers
    var bareTemplates = _.cloneDeep(route.templates)
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
                if (defined(route.templates[template])) {
                    // if there is a template for the controllers role then remove
                    // it from the list of unused templates
                    if (defined(bareTemplates[template].role[role])) {
                        delete bareTemplates[template].role[role]
                    }
                    // otherwise if there is a template for all roles then assign
                    // it to this controller so that another controller for the
                    // all role will not be created to serve the template
                    else if (defined(bareTemplates[template].role['all'])) {
                        delete bareTemplates[template].role['all']
                    }
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
        // add route for each method
        _.each(methods, (spec, method) => {
            // create ImmutableAppPresenter instance
            var presenter = new ImmutableAppPresenter({
                config: config,
                method: method,
                module: module,
                path: path,
                route: route,
                spec: spec,
            })
            // middleware for route
            var routeMiddleware = []
            // iterate over spec(s) for different roles
            _.each(spec, roleSpec => {
                // if spec has middleware add to router
                _.each(roleSpec.middleware, middleware => {
                    routeMiddleware.push(middleware)
                })
            })
            // add presenter as final middleware
            routeMiddleware.push(presenter)
            // add path to router with method
            route.router[method](path, routeMiddleware)
        })
    })
    // return router so it can be bound to parent
    return route.router
}

/**
 * @function initServices
 *
 * initialize ImmutableCoreServices defined in the services directory
 *
 * @param {object} config
 *
 * @returns {Promise}
 */
function initServices (config) {
    // get services directory
    var dirs = getDir(config, 'services')
    // load services definitions from each directory
    _.each(dirs, dir => initServicesDir(config, dir))
    // create new service instances from definitions
    _.each(config.services, (service, name) => {
        config.services[name] = new ImmutableCoreService(service)
    })
    // initialize all services
    return ImmutableCoreService.initializeAll()
}

/**
 * @function initServicesDir
 *
 * load all service definitions from directory
 *
 * @param {object} config
 * @param {string} dir
 *
 * @returns {Promise}
 */
function initServicesDir (config, dir) {
    // iterate over file names in directory
    _.each(fs.readdirSync(dir), file => {
        // get absolute file
        var absFile = `${dir}/${file}`
        // match services files
        var matches = file.match(/^(.*?)\.service\.js$/)
        // load file if it matches filename pattern
        if (matches) {
            // get service name from file name
            var serviceName = changeCase.camelCase(matches[1])
            // load service
            var service = require(path.relative(__dirname, absFile))
            // validate service name if defined
            if (defined(service.name)) {
                assert(service.name === serviceName, `service name ${service.name} does not match filename ${absFile}`)
            }
            // otherwise set service name from file name
            else {
                service.name = serviceName
            }
            // if service is already defined merge over existing definition
            if (defined(config.services[service.name])) {
                _.merge(config.services[service.name], service)
            }
            // otherwise set new service
            else {
                config.services[service.name] = service
            }
        }
        // ignore anything else
        else {
            debug('initServicesDir: ignoring %s', absFile)
        }
    })
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

/**
 * @function sortPlaceholdersLower
 *
 * sort function that sorts strings containing colon `:` lower
 *
 * @param {string} a
 * @param {string} b
 *
 * @returns {integer}
 */
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

/**
 * @function winstonFormatter
 *
 * create string for logging - file and line number will be added
 *
 * @param {object} options
 *
 * @returns {string}
 */
function winstonFormatter (options) {
    // get callsite to for filename:linenumber where logger was called
    var callsite = callsites()[10]
    // string to log
    return options.level + ': '
        + (typeof options.message === 'string' ? options.message : '' )
        + ' (' + callsite.getFileName() + ':'
        + callsite.getLineNumber() + ':'
        + callsite.getColumnNumber() + ')'
        + (typeof options.meta === 'object' && Object.keys(options.meta).length ? '\n\t'+ JSON.stringify(options.meta) : '' )
}