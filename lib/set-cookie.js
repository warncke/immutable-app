'use strict'

/* exports */
module.exports = setCookie

/**
 * @function setCookie
 *
 * set/clear cookie - if value is string then cookie will be set with value
 * and default options. if value is false then cookie will be cleared. if
 * value is object then it must contain a value and other properties will be
 * use as options.
 *
 * @param {string} name
 * @param {object} res
 * @param {boolean|object|string} value
 */
function setCookie (name, res, value) {
    // if value is string do simple set
    if (typeof value === 'string') {
        res.cookie(name, value)
    }
    // if value is false then clear cookie
    else if (value === false) {
        res.cookie(name, '', {expires: new Date(1)})
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
}