/*
 * Copyright 2016-present, McGill Robotics
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* jshint node: true, devel: true */
'use strict';

const
      bodyParser = require('body-parser'),
      crypto = require('crypto'),
      express = require('express'),
      request = require('request'),
      config = require('./config.json')

const GRAPH_API_BASE = 'https://graph.facebook.com/v2.10';

if (!(config.app_id &&
      config.app_secret &&
      config.verify_token &&
      config.access_token &&
      config.group_id)) {
  console.error('Missing config values');
  process.exit(1);
}

var app = express();
app.set('port', config.port);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));

function verifyRequestSignature(req, res, buf) {
  var signature = req.headers['x-hub-signature'];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an
    // error.
    console.error('Signature missing.');
  } else {
    var elements = signature.split('=');
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', config.app_secret)
      .update(buf)
      .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error('Couldn\'t validate the request signature.');
    }
  }
}

function printObj(obj) {
  console.log(JSON.stringify(obj, null, 4));
}

function processPostback(msg) {
  if (msg.postback.payload == 'POST_CANCEL_PAYLOAD') {
    sendQuickMsg(msg.sender.id, 'OK, I will not post it.');
  } else {
    sendQuickMsg(msg.sender.id, 'OK, I will post it anonymously, please wait for an admin to approve it.');
    sendPost(msg.postback.payload);
  }
}

function sendPost(payload) {
  request({
    baseUrl: GRAPH_API_BASE,
    url: `/${config.group_id}/feed`,
    qs: { access_token: config.access_token },
    method: 'POST',
    json: {
      'message': payload,
      'formatting': 'MARKDOWN'
    }
  }, function (error, response, body) {
    if (error || response.statusCode != 200) {
      console.error('Failed sending message', response.statusCode, response.statusMessage, body.error);
    }
  });
}

function processPage(data) {
  data.entry.forEach(function(pageEntry) {
    pageEntry.messaging.forEach(function(msg) {
      if (msg.message) {
        processMessage(msg);
      } else if (msg.postback) {
        processPostback(msg);
      }
    });
  });
}

function sendButtons(id, text, buttons) {
  request({
    baseUrl: GRAPH_API_BASE,
    url: '/me/messages',
    qs: { access_token: config.access_token },
    method: 'POST',
    json: {
      'recipient' : { 'id': id },
      'message': {
        'attachment':{
          'type': 'template',
          'payload':{
            'template_type': 'button',
            'text': text,
            "buttons": buttons
          }
        }
      }
    }
  }, function (error, response, body) {
    if (error || response.statusCode != 200) {
      console.error('Failed sending message', response.statusCode, response.statusMessage, body.error);
    }
  });
}

function processMessage(msg){
  if (msg.message.text.length > 512) {
    sendQuickMsg(msg.sender.id, 'Your post is too long, please limit it to 512 characters or less.');
  } else {
    var text = 'Your message:\n\"' + msg.message.text + '\"'
    var buttons = [
	  {
        'type': 'postback',
        'title': 'Submit it',
        'payload': msg.message.text
      }
    ];
    sendButtons(msg.sender.id, text, buttons);
  }
}

function sendQuickMsg(id, text) {
  request({
    baseUrl: GRAPH_API_BASE,
    url: '/me/messages',
    qs: { access_token: config.access_token },
    method: 'POST',
    json: { 'recipient' : { 'id': id }, 'message': { 'text' : text } }
  }, function (error, response, body) {
    if (error || response.statusCode != 200) {
      console.error('Failed sending message', response.statusCode, response.statusMessage, body.error);
    }
  });
}

app.get('/hr', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === config.verify_token) {
    console.log('Validated webhook.');
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error('Failed validation. Make sure the validation tokens match.');
    res.sendStatus(403);
  }
});

app.post('/hr', function (req, res) {
  var data = req.body;
  // Make sure this is a page subscription
  if (data.object == 'page') {
    processPage(data);
    res.sendStatus(200);
  }
});

app.listen(app.get('port'), function() {
  console.log('hr_help_bot is running on port', app.get('port'));
});

module.exports = app;
