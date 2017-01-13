var async = require('async');
var JiraClient = require('jira-connector');
var http = require('http');
var createHandler = require('github-webhook-handler');
var handler = createHandler({ path: '/webhook', secret: 'myhashsecret' });
var events = require('github-webhook-handler/events');

/* List all keys availabile for GitHub events.
Object.keys(events).forEach(function (event) {
    console.log(event, '=', events[event])
})
*/

// Setup Jira Connection

var jira = new JiraClient({
    host: 'anthemopensource.atlassian.net',
    basic_auth: {
        username: 'anthemopensource@webteks.com',
        password: 'MCSc6B6DhdCz'
    }
})

http.createServer(function (req, res) {
    handler(req, res, function (err) {
        res.statusCode = 404;
        res.end('no such location')
    })
}).listen(7777);


function syncItem() {
    return {
        "issue_number": "",
        "jira_key": "",
        "issue_url": "",
        "smart_url": "",
        "contributor": "",
        "contributor_url": "",
        "title": "",
        "pr_branch": "",
        "base_branch": "",
        "statuses_url": "",
        "description": ""
    }
}

handler.on('error', function (err) {
    console.error('Error:', err.message)
});

function isNewPr(event){
    if (event.payload.action == "opened" && event.payload.pull_request.state == "open") {
        console.log('Beginning to process event.id:', event.id);
        return true;
    } else {
        console.log("Skipping event.id:",event.id,"it has a action:",event.payload.action,"and a pull_request.state:",event.payload.pull_request.state);
        return false;
    }
}

function issue(newItem) {
    return {
        "fields": {
            "project": "CORTEX"
        },
        "summary": newItem.title,
        "description": newItem.description,
        "issuetype": {
            "name": "Task"
        }
    }
}

function createJiraIssue(newItem,callback) {
    var issue = new issue(newItem);
    jira.issue.createIssue(issue,function(err,results){
        if (err){
            callback(err)
        } {
            callback(null,results);
        }
    })


}

handler.on('pull_request', function(event){
    console.log('Processing pull_request');
    if (isNewPr(event) == true){
        var newItem = new syncItem();
        newItem.issue_number = event.payload.number;
        newItem.contributor = event.payload.sender.login;
        newItem.contributor_url = event.payload.sender.html_url;
        newItem.smart_url = event.payload.repository.full_name + "#" + event.payload.number;
        newItem.title = event.payload.pull_request.title;
        newItem.description = event.payload.pull_request.body + " \r\nReferences: " + event.payload.repository.full_name + "#" + event.payload.number;
        newItem.pr_branch = event.payload.pull_request.head.ref;
        newItem.base_branch = event.payload.pull_request.base.ref;
        newItem.issue_url = event.payload.pull_request.issue_url;
        newItem.statuses_url = event.payload.pull_request.statuses_url;

        createJiraIssue(newItem,function(err,results){
            console.log(results);
        })
    }
});
