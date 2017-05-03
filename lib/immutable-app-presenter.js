'use strict'

/* native modules */
const assert = require('assert')

/* npm modules */
const _ = require('lodash')
const defined = require('if-defined')
const httpError = require('immutable-app-http-error')

/* application modules */
const setCookie = require('./set-cookie')

/* exports */
module.exports = ImmutableAppPresenter

/* constants */
const jsonRegExp = /json/

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
    var json = req.query.json === '1' || req.query.json === 'true'
        || (req.xhr && req.query.json !== '0' && req.query.json !== 'false')
        || (req.headers.accept && req.headers.accept.match(jsonRegExp) && req.query.json !== '0' && req.query.json !== 'false')
        ? true : false
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
    // text
    if (field.inputType === 'text') {
        // if schmea type is number then clear value for empty string
        // which would break schema validation
        if ((field.schemaType === 'number' || field.schemaType === 'integer') && data[field.property] === '') {
            data[field.property] = undefined
        }
    }
    // checkbox
    else if (field.inputType === 'checkbox') {
        // convert to boolean
        data[field.property] = data[field.property] ? true : false
    }
    // nested array input
    else if (field.nested && field.array) {
        // if input has property then remove last row if it is all empty
        if (Array.isArray(data[field.property])) {
            // get last row in array
            var item = data[field.property][data[field.property].length - 1]
            // flag set to true if any values found
            var hasValues = false
            // check all properties of item to see if any have non empty values
            _.each(item, value => {
                if (!hasValues && typeof value === 'string' && value.length) {
                    hasValues = true
                }
            })
            // if there are no values then remove last item from array
            if (!hasValues) {
                data[field.property].pop()
            }
        }
        // otherwise set property as empty array
        else {
            data[field.property] = []
        }
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
    // check access
    var allow = args.accessControl.allowRoute({
        method: req.method.toLowerCase(),
        path: req.originalUrl,
        session: req.session,
    })
    // throw access denied error if not allowed
    if (!allow) {
        httpError(403)
    }
    // role used for selecting controller
    var activeRole
    // roles that client has
    var roles = req.session && req.session.roles
        ? req.session.roles
        : ['all']
    // get spec
    var spec = _.find(args.spec, controller => {
        // if controller is all then use controller
        if (controller.role === 'all') {
            activeRole = controller.role
            return true
        }
        // otherwise check if session has role
        else {
            // get number of roles
            var rolesLen = roles.length
            // check each roles
            for (var i=0; i < rolesLen; i++) {
                if (controller.role === roles[i]) {
                    activeRole = controller.role
                    return true
                }
            }
        }
    })
    // if client does not have a valid role for this method:path then 403
    if (!spec) {
        var error = new Error('Access Denied')
        error.code = 403
        throw error
    }
    // get controller method (if any)
    var method = spec.method
    // get template - either explicit or based on method name
    var template = spec.template || spec.methodName
    // resolve template name
    if (defined(args.route.templates[template])) {
        // use template for active role if found
        if (defined(args.route.templates[template].role[activeRole])) {
            template = args.route.templates[template].role[activeRole]
        }
        // use template for all if found
        else if (args.route.templates[template].role['all']) {
            template = args.route.templates[template].role['all']
        }
    }
    // append extension to template if not found
    if (!template.match(args.config.handlebars.templateRegExp)) {
        template = template + args.config.handlebars.ext
    }
    // data for template
    var data = {
        session: req.session,
    }
    // add default assets
    _.merge(data, args.config.assets)
    // if there is a controller method need to prep args and execute
    if (method) {
        // arguments for method call
        var methodArgs = getMethodArgs(args, req, spec)
        // call method
        method(methodArgs)
        // success
        .then(methodData => {
            // merge response into data
            _.mergeWith(data, methodData, mergeArrays)
            // if data has cookies set them
            if (data.cookies && spec.cookies !== false) {
                // set cookies
                _.each(data.cookies, (value, name) => {
                    setCookie(name, res, value)
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