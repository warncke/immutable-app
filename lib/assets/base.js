// execute after document ready
$(function () {
    // attach click handler to elements that show hidden divs
    $('.shower').find('i').click(showerClickHandler)
})

/**
 * @function showerClickHandler
 *
 * attach click handler to elements that show hidden divs
 */
function showerClickHandler ($ev) {
    $(this).parent().find('.shower-target').toggleClass('hide')
}