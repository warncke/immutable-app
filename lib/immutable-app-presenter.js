'use strict'

/* npm modules */
const ImmutableAccessControl = require('immutable-access-control')
const _ = require('lodash')
const defined = require('if-defined')
const httpError = require('immutable-core-controller').httpError

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
    // build args with session from request
    var methodArgs = {
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
    // require method
    if (!method) {
        httpError(404)
    }
    // arguments for method call
    var methodArgs = getMethodArgs(args, req, spec)
    // call method
    method(methodArgs)
    // success
    .then(data => {
        // if data has headers set them
        if (data.headers && spec.headers !== false) {
            // set headers
            _.each(data.headers, (value, name) => {
                res.set(name, value)
            })
            // delete headers from data
            delete data.headers
        }
        res.json(data)
    })
    // error
    .catch(next)
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