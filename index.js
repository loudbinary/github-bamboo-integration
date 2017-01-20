var async = require('async');
var JiraClient = require('jira-connector');
var http = require('http');
var createHandler = require('github-webhook-handler');
var handler = createHandler({ path: '/webhook', secret: 'myhashsecret' });
var events = require('github-webhook-handler/events');
var GitHub = require('github-api');
var Bamboo = require('bamboo-api');
var bamboo = new Bamboo('https://bamboo.previewmy.net','administrator', 'ndoTLTN0ZL0E');

const gh = new GitHub({
    username: 'openanthem-admin',
    password: '&1410h65117375'
});


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
        "description": "",
        "repo": "",
        "sha": ""
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

function isMaster(event) {

}

function jiraIssue(newItem) {
    return {
        "fields": {
            "project": {
                "id": 10501
            },
            "summary": newItem.title,
            "description": newItem.description,
            "issuetype": {
                "id": 10101
            },
            "labels":[
                "pull_request",
                "github"
            ]
        },

    }
}

function closePr(event,newItem,repo,callback) {
    repo.updatePullRequest(newItem.issue_number,{state:"closed"},function(){
        callback()
    })
}

function createJiraIssue(newItem,callback) {
    var issue = new jiraIssue(newItem);
    jira.issue.createIssue(issue,function(err,results){
        if (err){
            callback(err)
        } {
            callback(null,results);
        }
    })
}

function addCommentBambooBuild(newItem,repo,bambooResults,callback){
    var http = require("https");
    var options = {
        "method": "POST",
        "hostname": "bamboo.previewmy.net",
        "port": null,
        "path": "/rest/api/latest/result/" + bambooResults.buildResultKey + "/comment",
        "headers": {
            "content-type": "application/json",
            "authorization": "Basic YWRtaW5pc3RyYXRvcjpuZG9UTFROMFpMMEU=",
            "cache-control": "no-cache",
        }
    };

    var req = http.request(options, function (res) {
        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            callback(null,newItem,repo,bambooResults)
        });
    });

    req.write(JSON.stringify({ author: 'administrator',
        content: newItem.jira_key + ' is linked to this build' }));
    req.end();
}

handler.on('*', function(event){
    // Necessary to catch the test delivery.
   // console.log(event);
})

function getBuildStatus(newItem,repo,bambooResults,callback) {
    bamboo.getBuildStatus(bambooResults.buildResultKey, function(error, result) {
        if (error) {
            callback(null,newItem,repo,bambooResults,true)

        }
        if (result === "Successful" || result === 'Finished') {
            callback(null,newItem,repo,bambooResults,true)
        } else {
            getBuildStatus(newItem,repo,bambooResults,callback);
        };
    });
}

function checkStatus(event,callback) {
    if (isNewPr(event) == true) {
        var newItem = new syncItem();
        newItem.issue_number = event.payload.number;
        newItem.contributor = event.payload.sender.login;
        newItem.repo  = event.payload.repository.full_name;
        newItem.contributor_url = event.payload.sender.html_url;
        newItem.smart_url = event.payload.repository.full_name + "#" + event.payload.number;
        newItem.title = event.payload.pull_request.title;
        newItem.description = event.payload.pull_request.body + " \r\n\r\nReferences: " + event.payload.repository.full_name + "#" + event.payload.number;
        newItem.pr_branch = event.payload.pull_request.head.ref;
        newItem.base_branch = event.payload.pull_request.base.ref;
        newItem.issue_url = event.payload.pull_request.issue_url;
        newItem.jiraIssue_url = "";
        newItem.jira_key = "";
        newItem.sha = event.payload.pull_request.head.sha;
        newItem.statuses_url = event.payload.pull_request.statuses_url;
        var repo = gh.getRepo(newItem.repo);
        repo.updateStatus(newItem.sha, {
            state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
            description: 'Checking your work...',
            context: 'Pull Request Validation started'
        });
        async.waterfall([
            function(callback){
                repo.updateStatus(newItem.sha, {
                    state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                    description: 'Verifying PR is not to master...',
                    context: 'Checking branch'
                });
                callback(null,newItem,repo);
            },
            function(newItem,repo,callback){
                if (newItem.base_branch == 'master') {
                    repo.updateStatus(newItem.sha, {
                        state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Verifying PR is not to master...',
                        context: 'Checking branch'
                    });
                    closePr(event,newItem,repo,function(){
                        callback('Pull request sent to master, closed pull request.');
                    })
                    callback(null,newItem,repo)
                }
                else {
                    if (newItem.contributor != "openanthem-admin"){
                        repo.updateStatus(newItem.sha, {
                            state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Pull Request is not to master...',
                            context: 'Checking branch'
                        });
                        callback(null,newItem,repo);
                    } else {
                        repo.updateStatus(newItem.sha, {
                            state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Open Anthem Team request, skipping validation...',
                            context: 'Checking branch'
                        });
                        callback(null,newItem,repo);
                    }

                }
            },
            function(newItem,repo,callback) {
                if (newItem.base_branch == 'develop') {
                    repo.updateStatus(newItem.sha, {
                        state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Pull Request is to develop branch...',
                        context: 'Checking branch'
                    });
                    callback(null,newItem,repo);
                }
                else {
                    if (newItem.contributor != "openanthem-admin"){
                        repo.updateStatus(newItem.sha, {
                            state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'PR is to develop branch...',
                            context: 'Checking branch'
                        });
                        closePr(event,newItem,repo,function(){
                            callback('Pull request was not made to develop branch, closing pull request');
                        })
                    } else {
                        repo.updateStatus(newItem.sha, {
                            state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Open Anthem Team request, skipping validation...',
                            context: 'Checking branch'
                        });
                        callback(null,newItem,repo);
                    }

                }
            },
            function(newItem,repo,callback){
                repo.updateStatus(newItem.sha, {
                    state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                    description: 'Creating internal tracking...',
                    context: 'Syncronizing Pull Request to Open Anthem Team'
                });
                callback(null,newItem,repo);
            },
            function(newItem,repo,callback){
                createJiraIssue(newItem,function(err,results){
                    if (err) {
                        repo.updateStatus(newItem.sha, {
                            state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Failed to create internal tracking...',
                            context: 'Syncronizing Pull Request to Open Anthem Team',
                        });
                        callback(err)
                    } else {
                        newItem.jira_key = results.key;
                        newItem.jiraIssue_url = results.self;
                        repo.updateStatus(newItem.sha, {
                            state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Created internal tracking...',
                            context: 'Syncronizing Pull Request to Open Anthem Team',
                            target_url: newItem.jiraIssue_url
                        });
                        callback(null,newItem,repo);
                    }
                });
            },
            function(newItem,repo,callback){
                repo.updateStatus(newItem.sha, {
                    state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                    description: 'Creating internal tracking...',
                    context: 'Syncronizing Pull Request to Open Anthem Team'
                });
                callback(null,newItem,repo);
            },
            function(newItem,repo,callback) {
                repo.updateStatus(newItem.sha, {
                    state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                    description: 'Building and testing changes...',
                    context: 'Build and Test'
                })
                callback(null,newItem,repo);
            },
            function(newItem,repo,callback){
                var urlParams = {"os_authType": "basic","bamboo.variable.GITHUB_ISSUE_ID": newItem.issue_number, "bamboo.variable.JIRAISSUE_KEY": newItem.jira_key,"bamboo.variable.GITHUBISSUE_KEY": newItem.issue_number,"bamboo.variable.ISSUE_ID": newItem.issue_number,"bamboo.variable.JIRAISSUE_URL": newItem.jiraIssue_url,"bamboo.variable.GITHUB_ISSUE_URL": newItem.issue_url,"bamboo.variable.GITHUB_REPO": newItem.repo,"bamboo.variable.GITHUBISSUE_USER": "openanthem","bamboo.variable.JIRAISSUE_ID": newItem.jira_key};
                var buildParams = {"executeAllStages": true};

                bamboo.buildPlan("COR-BUIL", function(error, result) {
                    if (error) {
                        repo.updateStatus(newItem.sha, {
                            state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Unable to submit job, try again later...',
                            context: 'Build and Test'
                        });
                        console.log(error);
                        callback('Unable to submit job to bamboo');
                    }

                    console.log("Result:", result);
                    repo.updateStatus(newItem.sha, {
                        state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Submitted job, waiting for results...',
                        context: 'Build and Test'
                    });
                    callback(null,newItem,repo,JSON.parse(result));
                }, urlParams, buildParams);
            },
            function(newItem,repo,bambooResults,callback) {
                repo.updateStatus(newItem.sha, {
                    state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                    description: 'Waiting on build: ' + bambooResults.buildNumber,
                    context: 'Verifying build',
                    target_url: "https://bamboo.previewmy.net/browse/" + bambooResults.buildResultKey
                });
                callback(null,newItem,repo,bambooResults);
            },
            function(newItem,repo,bambooResults,callback){
                addCommentBambooBuild(newItem,repo,bambooResults,function(){
                    callback(null,newItem,repo,bambooResults)
                });
            },
            function(newItem,repo,bambooResults,callback) {
                var status = false;
                getBuildStatus(newItem,repo,bambooResults,function(err,newItem,repo,bambooResults){
                    if (err){
                        callback(err)
                    } else {
                        repo.updateStatus(newItem.sha, {
                            state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Build finished...' + bambooResults.buildNumber,
                            context: 'Verifying build',
                            target_url: "https://bamboo.previewmy.net/browse/" + bambooResults.buildResultKey
                        });
                        callback(null,newItem,repo,bambooResults);
                    }
                })
            }

        ],function(err,newItem,repo){
            repo.updateStatus(newItem.sha, {
                state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                description: 'Validation Completed successfully...',
                context: 'Pull Request Validation started'
            });
            callback(null);
        })
    }


}

handler.on('pull_request', function(event){
    console.log('Processing pull_request');
    checkStatus(event,function(){
        console.log('Finished processing');
    })
});