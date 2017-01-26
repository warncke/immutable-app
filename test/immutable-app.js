'use strict'

const immutableApp = require('../lib/immutable-app')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const httpClient = require('immutable-http-client')

chai.use(chaiAsPromised)
const assert = chai.assert

describe('immutable-app', function () {

    var app

    beforeEach(async function () {
        // catch async errors
        try {
            // reset global app config
            await immutableApp.reset()
            // create new app instance
            app = immutableApp('test-app')
            // set configuration for testing
            app.config({
                // do not exit on listen errors
                exit: false,
                // do not log
                log: false,
            })
        }
        catch (err) {
            throw err
        }
    })

    it('should start new app', async function () {
        // catch async errors
        try {
            // start server
            await app.start()
        }
        catch (err) {
            assert.ifError(err)
        }
    })

    it('should restart app', async function () {
        // catch async errors
        try {
            // start server
            await app.start()
        }
        catch (err) {
            assert.ifError(err)
        }
    })

})