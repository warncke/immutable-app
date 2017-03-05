'use strict'

const ImmutableCoreModel = require('immutable-core-model')

module.exports = new ImmutableCoreModel({
    name: 'address',
    columns: {
        accountId: false,
    },
    properties: {
        addressCountry: {
            default: 'US',
            description: 'ISO Country Code',
            title: 'Country',
            type: 'string',
        },
        addressLocality: {
            title: 'City',
            type: 'string',
        },
        addressRegion: {
            enum: ['AL', 'AK', 'AZ'],
            title: 'State',
            type: 'string',
        },
        firstName: {
            type: 'string',
        },
        lastName: {
            type: 'string',
        },
        postalCode: {
            errors: {
                pattern: '5 digit ZIP code required',
            },
            pattern: '^\\d{5}$',
            title: 'ZIP Code',
            type: 'string',
        },
        streetAddress: {
            type: 'string',
        },
    },
    required: [
        'addressCountry',
        'addressLocality',
        'addressRegion',
        'firstName',
        'lastName',
        'postalCode',
        'streetAddress',
    ],
})