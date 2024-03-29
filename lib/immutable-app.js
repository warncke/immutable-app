'use strict'

/* npm modules */
const Promise = require('bluebird')
const _ = require('lodash')
const debug = require('debug')('immutable-app')
const deepFreeze = require('deep-freeze')
const defined = require('if-defined')
const express = require('express')
const http = require('http')
const stackTrace = require('stack-trace')

/* application modules */
const init = require('./init')

/* exports */
module.exports = getModule

/* global variables */

// set bluebird as the global Promise provider
global.Promise = Promise

// default global configuration options
const defaultGlobalConfig = {
    // how frequently to check for access rule updates in seconds
    accessCheckInterval: 300,
    // database client to use for models
    mysql: {
        // default mysql client must be defined, other clients can be
        // added mapped by the model name that the driver is for
        default: undefined,
    },
    // exit on listen errors
    exit: true,
    // express app
    express: undefined,
    // set to true when app and all modules are initialized
    initialized: false,
    // use tls (https)
    https: false,
    // enable logging
    log: true,
    // custom winston logger - set false to disable custom logging
    logger: true,
    // all models for app indexed by name
    models: {},
    // app modules indexed by name
    modules: {},
    // list of module names in order added
    moduleNames: [],
    // port to listen on
    port: 7777,
    // redis client to use for models
    redis: {
        // default client will be used for all models except specified by name
        default: undefined,
    },
    // merged routes from modules
    routes: {},
    // http server
    server: undefined,
    // all services indexed by names
    services: {},
    // set to true when server started
    started: false,
    // list of express middleware to use
    use: [],
}

// default module configuration options
const defaultModuleConfig = {
    // app name
    name: undefined,
    // absolute path of base directory
    base: undefined,
    // directories for app assets - if dir is missing any funcitonality
    // depending on directory will not be loaded - defaults for all are
    // the app base path with the dir name (e.g. assets, app) appended
    dir: {
        app: [],
        services: [],
    },
    // all dirs in app indexed by absolute path
    dirs: {},
    // all files in app indexed by absolute path
    files: {},
    // routes are built from the app directory structure and files
    routes: {},
    // start function to call when starting app
    onStart: undefined,
}

// freeze default configuration objects - these are cloned for configuring app
deepFreeze(defaultGlobalConfig)
deepFreeze(defaultModuleConfig)

// get reference to global singleton instance
var immutableApp
// initialize global singleton instance if not yet defined
if (!global.__immutable_app__) {
    reset()
}
// use existing singleton instance
else {
    immutableApp = global.__immutable_app__
}

/**
 * @function getModule
 *
 * return existing or create new ImmutableAppModule module instance
 *
 * @param {string} name
 *
 * @returns {ImmutableAppModule}
 */
function getModule (name) {
    // create new module if it does not already exist
    if (!defined(immutableApp.modules[name])) {
        // create module
        immutableApp.modules[name] = new ImmutableAppModule(name)
        // add to list
        immutableApp.moduleNames.push(name)
    }
    // return module
    return immutableApp.modules[name]
}
// static functions
getModule.global = getGlobal
getModule.reset = reset

/**
 * @function ImmutableAppModule
 *
 * create new ImmutableAppModule instance.
 *
 * @param {string} name
 *
 * @returns {ImmutableAppModule}
 */
const ImmutableAppModule = function (name) {
    // initialize module instance with default module configuration
    _.merge(this, defaultModuleConfig)
    // set app name
    this.name = name
    // set absolute path of base directory for module
    this.base = getBase()
    // store reference to global app
    this.immutableApp = immutableApp
}

/* public functions */
ImmutableAppModule.prototype = {
    config: config,
    init: init,
    inspect: inspect,
    start: start,
    stop: stop,
    use: use,
}

/**
 * @function config
 *
 * get/set configuration variables - merges args over config
 *
 * @param {object} args
 *
 * @returns {object}
 *
 * @throws {Error}
 */
function config (args) {
    // iterate over args merging configuration to either the module or the
    // global configuration
    _.each(args, (val, key) => {
        // create new object to merge into config
        var merge = {}
        // set key and value to merge
        merge[key] = val
        // if this is a global config option then modify global config
        if (key in defaultGlobalConfig) {
            // merge args over config with custom handler to merge arrays
            _.mergeWith(immutableApp, merge, mergeArrays)
        }
        // if this is module config then set config on module instance
        else if (key in defaultModuleConfig) {
            // merge args over config with custom handler to merge arrays
            _.mergeWith(this, merge, mergeArrays)
        }
        // throw error on invalid configuration option
        else {
            throw new Error('invalid config option '+key)
        }
    })
    // return module
    return this
}

/**
 * @function getGlobal
 *
 * return global config
 *
 * @returns {object}
 */
function getGlobal () {
    return global.__immutable_app__
}

/**
 * @function reset
 *
 * shutdown server if running and reset global singleton data
 *
 * @returns {Promise}
 */
async function reset () {
    // catch async errors
    try {
        if (immutableApp && immutableApp.server && immutableApp.started) {
            await stop()
        }
        // create global app instance with defaults set
        immutableApp = global.__immutable_app__ = _.cloneDeep(defaultGlobalConfig)
        // create new express app
        immutableApp.express = express()
    }
    catch (err) {
        throw err
    }
}

/**
 * @function start
 *
 * start app
 *
 * @returns {Promise}
 */
async function start () {
    var config = this.immutableApp
    var module = this
    // initialize app if not yet initialized
    if (!config.initialized) {
        try {
            await this.init()
        }
        catch (err) {
            throw err
        }
    }
    // run any start functions for modules
    await Promise.each(_.values(config.modules), subModule => {
        // if onStart is function run it
        if (typeof subModule.onStart === 'function') {
            return subModule.onStart(config)
        }
    })
    debug('start Promise')
    // create new promise that will be resolved when server started
    return new Promise(function (resolve, reject) {
        // create HTTP server
        config.server = http.createServer(config.express)
        // create error handler
        config.server.on('error', function (err) {
            // only deal with listen errors
            if (err.syscall !== 'listen') {
                throw err
            }
            // log error if logging enable
            if (config.log) {
                // error msg detail
                var msg
                // get specific errors
                if (err.code === 'EACCES') {
                    msg = 'permission denied'
                }
                else if (err.code === 'EADDRINUSE') {
                    msg = 'address in use'
                }
                else {
                    msg = err.code
                }
                // log error
                console.error('listen on port '+config.port+' failed '+msg)
            }
            // if exit on error is set then exit
            if (config.exit) {
                process.exit(1)
            }
            // reject promise with error
            reject(err)
        })
        debug('start listen')
        // listen on provided port, on all network interfaces.
        config.server.listen(config.port, function () {
            // log start if logging enabled
            if (config.log) {
                console.log(module.name+' listening on port '+config.port)
            }
            // set started to true
            config.started = true
            // resolve promise
            resolve()
        })
    })
    // after starting check the START_TEST_ONLY flag and shut back down if it
    // is set - this flag is used to validate app config and sync models
    .then(() => {
        if (process.env.START_TEST_ONLY) {
            return this.stop().then(() => {
                if (config.log) {
                    console.log('START_TEST_ONLY success - server stopped')
                }
                process.exit()
            })
        }
    })
}

/**
 * @function stop
 *
 * stop app
 *
 * @returns {Promise}
 */
async function stop () {
    return new Promise(function (resolve, reject) {
        // if not server then resolve
        if (!immutableApp || !immutableApp.server || !immutableApp.started) {
            resolve()
        }
        // close server
        immutableApp.server.close(function (err) {
            if (err) {
                reject(err)
            }
            else {
                // clear server
                immutableApp.server = undefined
                immutableApp.started = false
                // resolve
                resolve()
            }
        })
    })
}

/**
 * @function use
 *
 * add arguments to list of express middleware that will be loaded
 * when express app is initialized.
 *
 */
function use () {
    this.immutableApp.use.push(Array.from(arguments))
}

/* private functions */

/**
 * @function getBase
 *
 * return asbsolute path of script that initially required immutable-app
 *
 * @returns {string}
 */
function getBase () {
    var trace = stackTrace.get()
    // get file name of file that created app instance - this is 3 frames
    // back: 0: getBase, 1: new ImmutableAppModule 2: getModule 3: caller
    var path = trace[3].getFileName()
    // remove file name from path
    return path.replace(/\/[^/]+$/, '')
}

/**
 * @function inspect
 *
 * generate output for util.inspect used by node.js console.log
 *
 * @param {integer} depth
 * @param {object} options
 *
 * @returns {string}
 */
function inspect (depth, options) {
    // get clone of app
    var obj = _.omit(immutableApp, ['express', 'inspect', 'server'])
    // go through modules and remove the same values
    obj.modules = _.mapValues(obj.modules, obj => {
        return _.omit(obj, ['express', 'immutableApp', 'inspect', 'server'])
    })
    // return object which will be formatted
    return obj
}

/**
 * @function mergeArrays
 *
 * mergeWith function for lodash to merge arrays
 *
 * @param {any} a
 * @param {any} b
 *
 * @returns {array|undefined}
 */
function mergeArrays (a, b) {
    // if target is array then add b to array otherwise return undefined
    // so normal _.merge will be performed
    return Array.isArray(a) ? a.concat(b) : undefined
}