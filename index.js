var http = require('http')
var createHandler = require('github-webhook-handler')
var handler = createHandler({ path: '/webhook', secret: 'myhashsecret' })
var events = require('github-webhook-handler/events')

Object.keys(events).forEach(function (event) {
    console.log(event, '=', events[event])
})
http.createServer(function (req, res) {
    handler(req, res, function (err) {
        res.statusCode = 404
        res.end('no such location')
    })
}).listen(7777)

handler.on('error', function (err) {
    console.error('Error:', err.message)
})


handler.on('issues', function(event){
    console.log('Issue event reporting in:');
    console.log(event);
});

handler.on('push', function (event) {
    console.log('Push event reporting in');
    console.log('event');
});

handler.on('pull_request', function(event){
    console.log('Pull Request event reporting in:');
    console.log(event);
});
