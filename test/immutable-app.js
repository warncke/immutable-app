'use strict'

const ImmutableDatabaseMariaSQL = require('immutable-database-mariasql')
const immutableApp = require('../lib/immutable-app')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const httpClient = require('immutable-http-client')
const immutable = require('immutable-core')

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

    var app

    // create database connection to use for testing
    var database = new ImmutableDatabaseMariaSQL(connectionParams)

    beforeEach(async function () {
        try {
            // reset immutable modules
            immutable.reset()
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
            })
        }
        catch (err) {
            throw err
        }
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
            assert.strictEqual(res.body, '<h1>Foo</h1>')
            // get foo index page
            var res = await httpClient.get('http://localhost:7777/foo/bar')
            // check response
            assert.strictEqual(res.statusCode, 200)
            assert.strictEqual(res.body, '<h1>Bar</h1>')
        }
        catch (err) {
            assert.ifError(err)
        }
    })

})