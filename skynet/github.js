var util = require('util');
var async = require('async');
var pathModule = require('path');
var config = require('config');
var constants = process.binding('constants');
var http = require('http');
var createHandler = require('github-webhook-handler');
var handler = createHandler({ path: config.github.webhook.get('path'), secret: config.github.webhook.get('secret') });
var events = require('github-webhook-handler/events');
var GitHub = require('github-api');
var github = exports;
var skynet = module.parent.exports;
var repo;

// Setup GitHub Connection
_github = new GitHub({
    username: config.github.get('username'),
    password: config.github.get('password')
});

var Stream = require('stream').Stream;
var EventEmitter = require('events').EventEmitter;

var Readable = Stream.Readable;
var Writable = Stream.Writable;

var DEBUG = process.env.NODE_DEBUG;
var errnoException = util._errnoException;

//config.bamboo.authorization = Buffer.from(config.bamboo.username + ':' + config.bamboo.password).toString('base64');

var USERNAME = config.github.get('username') || "MissingUserName";
var WEBHOOK_PATH = config.github.webhook.get('path') || "MissingWebHookPath";

function rethrow() {
    // Only enable in debug mode. A backtrace uses ~1000 bytes of heap space and
    // is fairly slow to generate.
    if (DEBUG) {
        var backtrace = new Error;
        return function(err) {
            if (err) {
                backtrace.stack = err.name + ': ' + err.message +
                    backtrace.stack.substr(backtrace.name.length);
                err = backtrace;
                throw err;
            }
        };
    }

    return function(err) {
        if (err) {
            throw err;  // Forgot a callback but don't know where? Use NODE_DEBUG=fs
        }
    };
}

function maybeCallback(cb) {
    return util.isFunction(cb) ? cb : rethrow();
}

// Ensure that callbacks run in the global context. Only use this function
// for callbacks that are passed to the binding layer, callbacks that are
// invoked from JS already run in the proper scope.
function makeCallback(cb) {
    if (!util.isFunction(cb)) {
        return rethrow();
    }

    return function() {
        return cb.apply(null, arguments);
    };
}



// Report error it is occurs
handler.on('error', function (err) {
    console.error('Error:', err.message)
});

// Does absolutely nothing, uncomment console if you are unsure on webhook configuration, it seems ALL
handler.on('*', function(event){
    // Necessary to catch the test delivery.
     //console.log(event);
});

handler.on('pull_request', function(event){
    console.log('Processing pull_request');
    checkStatus(event,function(){
        console.log('Finished processing');
    })
});

function checkStatus(event,callback){
    console.log(event);
}

github.getIssue = function(event,callback){
    console.log('found me');
    callback(null,'ping from the other side');
}

//repo,sha,context,state,target_url,callback
github.updateIssueStatus = function(sha,callback){
    if (!repo){
        repo = _github.getRepo('openanthem/cortex');
    }

    //console.log(repo);
    /*
    repo.updateStatus(newItem.sha, {
        state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
        description: 'Checking your work...',
        context: 'Pull Request Validation started'
    });
    */
}

github.USERNAME = USERNAME;
github.WEBHOOK_PATH = WEBHOOK_PATH;
github.repo = repo;

http.createServer(function (req, res) {
    handler(req, res, function (err) {
        res.statusCode = 404;
        res.end('no such location')
    })
}).listen(config.web.get('port'));
