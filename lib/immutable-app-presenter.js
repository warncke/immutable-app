'use strict'

/* native modules */
const assert = require('assert')

/* npm modules */
const _ = require('lodash')

/* exports */
module.exports = ImmutableAppPresenter

/**
 * ImmutableAppPresenter
 *
 * create and return a new express route handler function that does the work
 * of extracting controller args from express inputs, validating args, calling
 * the controller, determining how the controller output should be presented
 * (json, html, cookies, headers, etc) and calling correct express methods
 * to return output.
 *
 * @param {object} args
 * @param {object} args.config - global app config
 * @param {string} args.method - http method for request
 * @param {object} args.module - config for module that route belongs to
 * @param {string} args.path - express path string
 * @param {object} args.route - route config
 * @param {object} args.spec - path config
 *
 */
function ImmutableAppPresenter (args) {
    // get model
    var model = args.route.model
    if (model) {
        // create reg-ex to match base path
        args.baseRegExp = new RegExp('\\/'+model.path.replace('-', '\\-')+'$')
    }
    // return express route handler function
    return (req, res, next) => {
        presenter(args, req, res, next)
    }
}

/* private functions */

/**
 * @function getMethodArgs
 *
 * build args for controller method call from request using the input mapping
 *
 * @param {object} args
 * @param {object} req
 * @param {object} spec
 *
 * @returns {object}
 */
function getMethodArgs (args, req, spec) {
    // whether or not response will be JSON
    var json = req.query.json === '1' || req.query.json === 'true' || (req.xhr && req.query.json !== '0' && req.query.json !== 'false') ? true : false
    // build args with session from request
    var methodArgs = {
        json: json,
        session: req.session || {},
    }
    // get input based on spec
    _.each(spec.input, (src, dst) => {
        methodArgs[dst] = _.get(req, src)
    })
    // get controller
    var controller = args.route.controller
    // get model
    var model = args.route.model
    // if model data is being submitted do some normalization
    if (controller && controller.form && model && methodArgs[model.name]) {
        var data = methodArgs[model.name]
        // iterate over fields
        _.each(controller.form.fields, field => {
            if (Array.isArray(field)) {
                _.each(field, field => {
                    normalizeInput(data, field)
                })
            }
            else {
                normalizeInput(data, field)
            }
        })
    }
    // return args
    return methodArgs
}

/**
 * @function normalizeInput
 *
 * @param {object} data
 * @param {object} field
 */
function normalizeInput (data, field) {
    // checkbox
    if (field.inputType === 'checkbox') {
        // convert to boolean
        data[field.property] = data[field.property] ? true : false
    }
}

/**
 * @function presenter
 *
 * @param {object} args
 * @param {object} req
 * @param {object} res
 * @param {function} next
 */
function presenter (args, req, res, next) {
    // if path is for base of model and missing trailing slash redirect
    if (args.baseRegExp && req.originalUrl.match(args.baseRegExp)) {
        // redirect to url with trailing slash
        res.redirect(301, './'+args.route.model.path+'/')
        return
    }
    // get spec
    var spec = args.spec
    // get controller method (if any)
    var method = spec.method
    // get template - either explicit or based on method name
    var template = args.spec.template || args.spec.methodName
    // data for template
    var data = {}
    // add default assets
    _.merge(data, args.config.assets)
    // if there is a controller method need to prep args and execute
    if (method) {
        // arguments for method call
        var methodArgs = getMethodArgs(args, req, args.spec)
        // call method
        method(methodArgs)
        // success
        .then(methodData => {
            // merge response into data
            _.merge(data, methodData)
            // if data has cookies set them
            if (data.cookies && spec.cookies !== false) {
                // set cookies
                _.each(data.cookies, (value, name) => {
                    // if value is string do simple set
                    if (typeof value === 'string') {
                        res.cookie(name, value)
                    }
                    // if object then contains options
                    else if (typeof value === 'object') {
                        // value is object containing options and value
                        var options = value
                        // get value
                        value = options.value
                        // delete value from options
                        delete options.value
                        // set cookie with options
                        res.cookie(name, value, options)
                    }
                    // invalid
                    else {
                        throw new Error('invalid cookie value')
                    }
                })
                // delete cookies from data
                delete data.cookies
            }
            // if data has headers set them
            if (data.headers && spec.headers !== false) {
                // set headers
                _.each(data.headers, (value, name) => {
                    res.set(name, value)
                })
                // delete headers from data
                delete data.headers
            }
            // if request is xhr or has json flag set then return json
            if (methodArgs.json) {
                res.json(data)
            }
            else {
                res.render(template, data)
            }
        })
        // error
        .catch(next)
    }
    // if there is no method then only render template
    else {
        // require template
        assert.ok(template, 'no template found')
        // render template
        res.render(template, data)
    }
}