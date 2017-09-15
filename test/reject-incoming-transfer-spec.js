'use strict'
/* eslint-env mocha */

const nock = require('nock')
const rejectIncomingTransfer = require('../src/handlers/public/reject-incoming-transfer')

describe('Reject incoming transfer (public)', function () {
  beforeEach(function () {
    this.rejectIncomingTransfer = rejectIncomingTransfer()
    this.defaultRejectionMessage = {
      code: 'R01',
      name: 'Insufficient Source Amount',
      message: 'Insufficient incoming liquidity',
      triggered_by: 'g.usd.connie.west.server',
      forwarded_by: [],
      triggered_at: new Date(),
      additional_info: {}
    }
  })

  it('posts the rejection message', function () {
    nock('http://connie-east:8081')
      .post('/internal/transfer/5857d460-2a46-4545-8311-1539d99e78e8/rejection', JSON.stringify(this.defaultRejectionMessage))
      .reply(204)
    return this.rejectIncomingTransfer({
      id: 'd18892e4-a8f8-4417-8d24-fd87867d88e0',
      noteToSelf: {
        source: {
          uri: 'http://connie-east:8081',
          id: '5857d460-2a46-4545-8311-1539d99e78e8'
        }
      }
    }, this.defaultRejectionMessage)
  })
})
