'use strict'

module.exports = ({ plugin }) => async ({ id, fulfillment, fulfillmentData }) => {
  await plugin.fulfillCondition(id, fulfillment, fulfillmentData)
}
