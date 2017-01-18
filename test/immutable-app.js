'use strict'

const Promise = require('bluebird')
const app = require('../lib/immutable-app')
const chai = require('chai')
const chaiAsPromised = require('chai-as-promised')
const httpClient = require('immutable-http-client')

chai.use(chaiAsPromised)
const assert = chai.assert

const testPort = 37591
const testUrl = 'http://localhost:'+testPort

describe('immutable-app', function () {

    beforeEach(function () {
        app.reset()
    })

})