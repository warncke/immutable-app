'use strict'

const ImmutableAccessControl = require('immutable-access-control')
const ImmutableCoreModel = require('immutable-core-model')
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
    database: dbName,
    host: dbHost,
    password: dbPass,
    user: dbUser,
}

describe('immutable-app - address', function () {

    var accessControl, app, mysql

    before(async function () {
        // create database connection to use for testing
        mysql = await ImmutableCoreModel.createMysqlConnection(connectionParams)
    })

    after(async function () {
        await mysql.close()
        await app.stop()
    })

    beforeEach(async function () {
        // reset immutable modules
        immutable.reset()
        ImmutableAccessControl.reset()
        ImmutableCoreModel.reset()
        // create new access control provider
        accessControl = new ImmutableAccessControl()
        // disable strict mode
        accessControl.strict = false
        // drop any test tables
        await mysql.query('DROP TABLE IF EXISTS address')
        // reset global app config
        await immutableApp.reset()
        // create new app instance
        app = immutableApp('test-app')
        // set configuration for testing
        app.config({
            // set default database
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

    it('should get new address page', async function () {
        try {
            // get new address page
            var res = await httpClient.get('http://localhost:7777/address/new')
            // check response
            assert.strictEqual(res.statusCode, 200)
        }
        catch (err) {
            assert.ifError(err)
        }
    })

})