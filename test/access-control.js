'use strict'

const ImmutableAccessControl = require('immutable-access-control')
const ImmutableCoreModel = require('immutable-core-model')
const immutableApp = require('../lib/immutable-app')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const httpClient = require('immutable-http-client')
const immutable = require('immutable-core')
const sinon = require('sinon')

chai.use(chaiAsPromised)
const assert = chai.assert

const dbHost = process.env.DB_HOST || 'localhost'
const dbName = process.env.DB_NAME || 'test'
const dbPass = process.env.DB_PASS || 'test'
const dbUser = process.env.DB_USER || 'test'

// use the same params for all connections
const connectionParams = {
    database: dbName,
    host: dbHost,
    password: dbPass,
    user: dbUser,
}

describe('immutable-app - access control', function () {

    var accessControl, app, mysql, sandbox

    before(async function () {
        // create database connection to use for testing
        mysql = await ImmutableCoreModel.createMysqlConnection(connectionParams)
    })

    after(async function () {
        await mysql.end()
        await app.stop()
    })

    beforeEach(async function () {
        // clear env variables
        delete process.env.NO_SYNC
        delete process.env.START_TEST_ONLY
        // reset immutable modules
        immutable.reset()
        ImmutableAccessControl.reset()
        ImmutableCoreModel.reset()
        // create new access control provider
        accessControl = new ImmutableAccessControl()
        // disable strict mode
        accessControl.strict = false
        // drop any test tables
        await mysql.query('DROP TABLE IF EXISTS foo')
        // reset global app config
        await immutableApp.reset()
        // create new app instance
        app = immutableApp('test-app')
        // set configuration for testing
        app.config({
            // set default mysql client
            mysql: {
                default: mysql,
            },
            // do not exit on listen errors
            exit: false,
            // do not log
            log: false,
            // do not use winston logger
            logger: false,
        })
        // start server
        await app.start()
    })

    it('should allow access by default', async function () {
        try {
            var res = await httpClient.fetch('http://localhost:7777/foo/')
        }
        catch (err) {
            assert.ifError(err)
        }
        // check response
        assert.strictEqual(res.status, 200)
    })

    it('should deny access to all', async function () {
        try {
            accessControl.setRule(['all', 'route:0'])
            var res = await httpClient.fetch('http://localhost:7777/foo/')
        }
        catch (err) {
            assert.ifError(err)
        }
        // check response
        assert.strictEqual(res.status, 403)
    })

    it('should allow access to specific', async function () {
        try {
            accessControl.setRule(['all', 'route:0'])
            accessControl.setRule(['all', 'route:/foo/:get:1'])
            var res = await httpClient.fetch('http://localhost:7777/foo/')
        }
        catch (err) {
            assert.ifError(err)
        }
        // check response
        assert.strictEqual(res.status, 200)
    })

})