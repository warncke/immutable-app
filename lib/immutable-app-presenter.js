'use strict'

/* native modules */
const assert = require('assert')

/* npm modules */
const ImmutableAccessControl = require('immutable-access-control')
const _ = require('lodash')
const defined = require('if-defined')
const httpError = require('immutable-app-http-error')

/* application modules */
const setCookie = require('./set-cookie')

/* exports */
module.exports = ImmutableAppPresenter

/* constants */
const isProd = process.env.NODE_ENV === 'prod' || process.env.NODE_ENV === 'production'
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
        // if source is array then it is list of possible values
        if (Array.isArray(src)) {
            var srcLength = src.length
            // check each source value and take first
            for (var i=0; i < srcLength; i++) {
                var val = _.get(req, src[i])
                // if value found then use and break
                if (defined(val)) {
                    methodArgs[dst] = val
                    break
                }
            }
        }
        // otherwise source should be string property name
        else {
            methodArgs[dst] = _.get(req, src)
        }
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
    // replace empty strings with undefined
    if ((field.inputType === 'text' || field.inputType === 'select') && data[field.property] === '') {
        data[field.property] = undefined
    }
    // convert checkbox value to boolean
    else if (field.inputType === 'checkbox') {
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
        httpError(403)
    }
    // check access unless allowed for all
    if (!spec.allow) {
        // get global access control instance
        var accessControl = ImmutableAccessControl.getGlobal()
        // check access
        var allow = accessControl.allowRoute({
            method: req.method.toLowerCase(),
            path: req.originalUrl,
            session: req.session,
        })
        // throw access denied error if not allowed
        if (!allow) {
            httpError(403)
        }
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
    // response data - either template args or json
    var data = {}
    // if there is a controller method need to prep args and execute
    if (method) {
        // arguments for method call
        var methodArgs = getMethodArgs(args, req, spec)
        // call method
        method(methodArgs)
        // success
        .then(methodData => {
            // should response be json
            var json = spec.json
            // if json request in args or by content type then set
            // unless not allowed by spec
            if (methodArgs.json && json !== false) {
                json = true
            }
            // set default args for template if not a json response
            if (!json) {
                data.session = req.session
                _.merge(data, args.config.assets)
            }
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
            // if data has template then use it
            if (data.template) {
                template = data.template
            }
            // if request is xhr or has json flag set then return json
            if (json) {
                res.json(data)
            }
            else {
                // set production flag for template only
                if (!defined(data.production)) {
                    data.production = isProd
                }
                // if there are components then add component assets
                if (defined(data.components)) {
                    data.js.push({src: 'https://cdn.jsdelivr.net/npm/handlebars@4.0.10/dist/handlebars.runtime.min.js'})
                    data.js.push({src: '/assets/immutable-app-component.js'})
                }
                // set layout if not defined
                if (defined(spec.layout) && !defined(data.layout)) {
                    data.layout = spec.layout
                }
                // render template
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
        // set default data for template
        data.session = req.session
        _.merge(data, args.config.assets)
        // set production flag for template only
        if (!defined(data.production)) {
            data.production = isProd
        }
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