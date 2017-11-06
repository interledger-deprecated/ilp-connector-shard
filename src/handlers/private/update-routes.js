'use strict'

module.exports = ({ routingTable }) => ({ all }) => {
  if (all) {
    routingTable.setRoutes(all)
  }
}
