'use strict'

module.exports = {
    paths: {
        '/:foo': {
            get: {
                method: getFoo,
                methodName: 'getFoo',
            },
        },
    },
}

function getFoo (args) {

}