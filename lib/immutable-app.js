'use strict'

/* npm modules */
const Promise = require('bluebird')

/* application modules */

/* exports */
const ImmutableApp = {

}

module.exports = ImmutableApp

/* global variables */

// get reference to global singleton instance
var app
// initialize global singleton instance if not yet defined
if (!global.__immutable_app__) {
    app = global.__immutable_app__ = {

    }
    // all default global variable values must be set by reset() method
    reset()
}
// use existing singleton instance
else {
    app = global.__immutable_app__
}

/* public functions */

/**
 * @function reset
 *
 * shutdown server if running and reset global singleton data
 *
 * @returns {ImmutableApp}
 */
function reset () {
    // return immutable
    return ImmutableApp
}