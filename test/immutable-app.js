'use strict'

const ImmutableAccessControl = require('immutable-access-control')
const ImmutableCoreModel = require('immutable-core-model')
const ImmutableDatabaseMariaSQL = require('immutable-database-mariasql')
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
const dbPass = process.env.DB_PASS || ''
const dbUser = process.env.DB_USER || 'root'

// use the same params for all connections
const connectionParams = {
    charset: 'utf8',
    db: dbName,
    host: dbHost,
    password: dbPass,
    user: dbUser,
}

describe('immutable-app', function () {

    var accessControl, app, sandbox

    // create database connection to use for testing
    var database = new ImmutableDatabaseMariaSQL(connectionParams)

    beforeEach(async function () {
        // clear env variables
        delete process.env.NO_SYNC
        delete process.env.START_TEST_ONLY
        // create sinon sandbox
        sandbox = sinon.sandbox.create()
        // reset immutable modules
        immutable.reset()
        ImmutableAccessControl.reset()
        ImmutableCoreModel.reset()
        // create new access control provider
        accessControl = new ImmutableAccessControl()
        // disable strict mode
        accessControl.strict = false
        // drop any test tables
        await database.query('DROP TABLE IF EXISTS foo')
        // reset global app config
        await immutableApp.reset()
        // create new app instance
        app = immutableApp('test-app')
        // set configuration for testing
        app.config({
            // set default database
            database: {
                default: database,
            },
            // do not exit on listen errors
            exit: false,
            // do not log
            log: false,
            // do not use winston logger
            logger: false,
        })
    })

    afterEach(function () {
        // reset all stubs
        sandbox.restore()
    })

    it('should start new app', async function () {
        try {
            // start server
            await app.start()
        }
        catch (err) {
            assert.ifError(err)
        }
    })

    it('should stop server if START_TEST_ONLY env variable set', async function () {
        // stub process.exit
        var processExitStub = sandbox.stub(global.process, 'exit')
        // set env variable
        process.env.START_TEST_ONLY = true
        try {
            // start server
            await app.start()
        }
        catch (err) {
            assert.ifError(err)
        }
        // check that process.exit called
        assert(processExitStub.calledOnce)
    })

    it('should serve templates with default controller', async function () {
        try {
            // start server
            await app.start()
            // get index page
            var res = await httpClient.get('http://localhost:7777/')
            // check response
            assert.strictEqual(res.statusCode, 200)
            assert.strictEqual(res.body, '<h1>Hello World</h1>')
            // get foo index page
            var res = await httpClient.get('http://localhost:7777/foo')
            // check response
            assert.strictEqual(res.statusCode, 200)
            // get foo index page
            var res = await httpClient.get('http://localhost:7777/foo/bar')
            // check response
            assert.strictEqual(res.statusCode, 200)
        }
        catch (err) {
            assert.ifError(err)
        }
    })

    it('should create new foo instance', async function () {
        try {
            // start server
            await app.start()
            // get foo index page
            var res = await httpClient.post('http://localhost:7777/foo/', {
                body: {
                    foo: {foo: 'bar'}
                },
                qs: {
                    json: true,
                },
            })
        }
        catch (err) {
            assert.ifError(err)
        }
        // check response
        assert.strictEqual(res.statusCode, 200)
        assert.deepEqual(res.body.data, {foo: 'bar'})
    })

})