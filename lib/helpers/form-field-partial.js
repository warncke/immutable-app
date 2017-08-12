'use strict'

module.exports = {
    formFieldPartial: formFieldPartial,
}

/**
 * @function formFieldPartial
 *
 * return path for partial to match input type
 *
 * @returns {string}
 */
function formFieldPartial (field) {
    if (field.legend) {
        return 'form/field-legend'
    }
    else if (field.nested) {
        if (field.array) {
            return 'form/field-nested-array'
        }
    }
    else {
        return `form/field-${field.inputType}`
    }
}