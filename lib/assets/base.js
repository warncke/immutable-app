// execute after document ready
$(function () {
    // attach click handler to elements that show hidden divs
    $('.shower').find('i').click(showerClickHandler)

    // attach handlers for nested array controls
    $('.nested-array-item-actions').each(nestedArrayItemBindEventHandlers)

    // add confirmation dialog for deletes
    $('.action.delete').click(confirmDelete)
})

/** CONFIRM DELETE **/

/**
 * @function confirmDelete
 *
 * show delete confirmation dialog on click
 */
function confirmDelete (ev) {
    return confirm('Delete item?')
}

/** SHOW HIDDEN DIVS WHEN CLICKING SHOWER ELEMENT **/

/**
 * @function showerClickHandler
 *
 * attach click handler to elements that show hidden divs
 */
function showerClickHandler (ev) {
    $(this).parent().find('.shower-target').toggleClass('hide')
}

/** NESTED ARRAY ACTION CONTROLS **/

/**
 * @function nestedArrayAdd
 *
 * add item to nested array
 */
function nestedArrayAdd (ev) {
    var $actions = $(this)
    // get item container
    var $item = $actions.closest('.nested-array-item')
    // get nested array container
    var $nestedArray = $item.closest('.nested-array')
    // create new item
    var $newItem = $item.clone()
    // remove any extra elements
    $newItem.find('.extra').remove()
    // show any hidden elements
    $newItem.find('.hide').removeClass('hide')
    // clear all values from item inputs
    nestedArrayItemClearValues($newItem)
    // bind event handlers to nested array item
    nestedArrayItemBindEventHandlers($newItem)
    // insert new item after item
    $item.after($newItem)
    // update input names
    nestedArrayRename($nestedArray)
}

/**
 * @function nestedArrayDown
 *
 * move nested array item down
 */
function nestedArrayDown (ev) {
    var $actions = $(this)
    // get item container
    var $item = $actions.closest('.nested-array-item')
    // get nested array container
    var $nestedArray = $item.closest('.nested-array')
    // get next item in list
    var $next = $item.next()
    // if next exists insert after
    if ($next.length) {
        // remove item
        $item.detach()
        // make item last in list
        $next.after($item)
        // update input names
        nestedArrayRename($nestedArray)
    }
}

/**
 * @function nestedArrayFirst
 *
 * make nested array item first in list
 */
function nestedArrayFirst (ev) {
    var $actions = $(this)
    // get item container
    var $item = $actions.closest('.nested-array-item')
    // get nested array container
    var $nestedArray = $item.closest('.nested-array')
    // remove item
    $item.detach()
    // make item last in list
    $nestedArray.prepend($item)
    // update input names
    nestedArrayRename($nestedArray)
}

/**
 * @function nestedArrayItemClearValues
 *
 * clear all values from item inputs
 */
function nestedArrayItemClearValues ($item) {
    // clear values on all inputs
    $item.find('input').each(function () {
        $(this).val('')
    })
    // clear selected flag on any select options
    $item.find('select').each(function () {
        $(this).find('option').each(function () {
            $(this).prop('selected', false)
        })
    })
}

/**
 * @function nestedArrayItemBindEventHandlers
 *
 * bind event handlers to nested array item
 */
function nestedArrayItemBindEventHandlers ($item) {
    // set item from this if not set
    if (!$item || !$item.find) {
        $item = $(this)
    }
    $item.find('.nested-array-item-action-first').click(nestedArrayFirst)
    $item.find('.nested-array-item-action-up').click(nestedArrayUp)
    $item.find('.nested-array-item-action-down').click(nestedArrayDown)
    $item.find('.nested-array-item-action-last').click(nestedArrayLast)
    $item.find('.nested-array-item-action-remove').click(nestedArrayRemove)
    $item.find('.nested-array-item-action-add').click(nestedArrayAdd)
}

/**
 * @function nestedArrayLast
 *
 * make nested array item last on list
 */
function nestedArrayLast (ev) {
    var $actions = $(this)
    // get item container
    var $item = $actions.closest('.nested-array-item')
    // get nested array container
    var $nestedArray = $item.closest('.nested-array')
    // remove item
    $item.detach()
    // make item last in list
    $nestedArray.append($item)
    // update input names
    nestedArrayRename($nestedArray)
}

/**
 * @function nestedArrayRemove
 *
 * remove nested array item from list
 */
function nestedArrayRemove (ev) {
    var $actions = $(this)
    // get item container
    var $item = $actions.closest('.nested-array-item')
    // get nested array container
    var $nestedArray = $item.closest('.nested-array')
    // remove item
    $item.remove()
    // update input names
    nestedArrayRename($nestedArray)
}

// regex to match array index notation
var indexRegExp = /\[\d+\]/
// match number in id
var idRegExp = /\d+$/

/**
 * @function nestedArrayRename
 *
 * go through nested array input elements and set correct index for name
 */
function nestedArrayRename ($nestedArray) {
    // start number rows at zero
    var rowNum = 0
    // go through each array item and make sure row number is correct
    $nestedArray.find('.nested-array-item').each(function () {
        var $item = $(this)
        // build index string
        var rowIndex = '['+rowNum+']'
        // rename any input elements
        $item.find('input,select').each(function () {
            var $input = $(this)
            // get name
            var name = $input.attr('name')
            // replace index
            name = name.replace(indexRegExp, rowIndex)
            // set new name
            $input.attr('name', name)
            // get id
            var id = $input.attr('id')
            // replace index
            id = id.replace(idRegExp, rowNum)
            // set updated id
            $input.attr('id', id)
        })
        // set new row number for next row
        rowNum++
    })
}

/**
 * @function nestedArrayUp
 *
 * move nested array item up
 */
function nestedArrayUp (ev) {
    var $actions = $(this)
    // get item container
    var $item = $actions.closest('.nested-array-item')
    // get nested array container
    var $nestedArray = $item.closest('.nested-array')
    // get previous item in list
    var $prev = $item.prev()
    // if next exists insert after
    if ($prev.length) {
        // remove item
        $item.detach()
        // make item last in list
        $prev.before($item)
        // update input names
        nestedArrayRename($nestedArray)
    }
}