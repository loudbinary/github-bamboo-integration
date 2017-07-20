require('dotenv').config();
const async = require('async');
const axios = require('axios');
const Promise = require('bluebird');
const JiraClient = require('jira-connector');
const http = require('http');
const createHandler = require('github-webhook-handler');
const handler = createHandler({ path: '/webhook', secret: 'myhashsecret' });
const events = require('github-webhook-handler/events');
const GitHub = require('github-api');
const Bamboo = require('bamboo-api');

Promise.promisifyAll(JiraClient);
Promise.promisifyAll(Bamboo);

// Setup Bamboo connection
const bamboo = new Bamboo(
    `https://${process.env.BAMBOO_URL}`,
    process.env.BAMBOO_USERNAME,
    process.env.BAMBOO_PASSWORD
);

// Setup GitHub Connection
const github = new GitHub({
    username: process.env.GITHUB_USERNAME,
    password: process.env.GITHUB_PASSWORD
});

// Setup Jira Connection
const jira = new JiraClient({
    host: process.env.JIRA_URL,
    basic_auth: {
        username: process.env.JIRA_USERNAME,
        password: process.env.JIRA_PASSWORD
    }
});

const bambooAuth = Buffer.from(`${process.env.BAMBOO_USERNAME}:${process.env.BAMBOO_PASSWORD}`).toString('base64');
// Start listening for webhooks
http.createServer(function (req, res) {
    handler(req, res, function (err) {
        res.statusCode = 404;
        res.end('no such location')
    })
}).listen(process.env.WEB_PORT);

// Report error it is occurs
handler.on('error', function (err) {
    console.error('Error:', err.message)
});

// Checks event to verify item is new pull request
// Returns True or False
function isNewPr(event){
    if (event.payload.action === 'opened' && event.payload.pull_request.state === "open") {
        console.log('Beginning to process event.id:', event.id);
        return true;
    } else {
        console.log("Skipping event.id:",event.id,"it has a action:",event.payload.action,"and a pull_request.state:",event.payload.pull_request.state);
        return false;
    }
}

// Given collected details, constructs jiraIssue payload
function jiraIssue(newItem) {
    return {
        "fields": {
            "project": {
                "id": process.env.JIRA_PROJECT_ID
            },
            "summary": newItem.title,
            "description": newItem.description,
            "issuetype": {
                "id": process.env.JIRA_ISSUETYPE_ID
            },
            "labels": process.env.JIRA_LABELS
        },

    }
}

// Closes Pull Request
// TODO: Need to add comment, just prior to closure and why.
function closePr(newItem,repo) {
    return repo.updatePullRequest(newItem.issue_number,{state:'closed'});
}

// Sends jiraIssue for creation
function createJiraIssue(newItem,callback) {
    const issue = new jiraIssue(newItem);
    return jira.issue.createIssueAsync(issue);
}

// Add recently created Jira Issue to recently started Bamboo build.
function addCommentBambooBuild(newItem,repo,bambooResults){
    const options = {
        "method": "POST",
        "hostname": `${process.env.BAMBOO_URL}/rest/api/latest/result/${bambooResults.buildResultKey}/comment`,
        "headers": {
            "content-type": "application/json",
            "authorization": `Basic ${bambooAuth}`,
            "cache-control": "no-cache",
        }
    };

    return axios(options);
    // NOT SURE WHAT WAS TRYING TO BE ACCOMPLISHED HERE:
    // req.write(JSON.stringify({ author: 'administrator',
    //     content: `${newItem.jira_key} is linked to this build` }));
}

// Does absolutely nothing, uncomment console if you are unsure on webhook configuration, it seems ALL
handler.on('*', function(event){
    // Necessary to catch the test delivery.
   // console.log(event);
})

// Potentially dangerous recursive lookup, and wait for buildstatus in Bamboo.
// TODO: Implement eventing for BuildStatus monitoring, and reporting
function getBuildStatus(newItem,repo,bambooResults,callback) {
    // may need to implement a retry to wait for buildstatus update
    return bamboo.getBuildStatusAsync(bambooResults.buildResultKey);
}

function checkStatus(event,callback) {
    if (isNewPr(event) == true) {
        const newItem = buildSyncItem(event);
        const repo = github.getRepo(newItem.repo);

        return repo.updateStatus(newItem.sha, {
                state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                description: 'Checking your work...',
                context: 'Pull Request Validation started'
            })
            .then(() => repo.updateStatus(newItem.sha, {
                state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                description: 'Verifying PR is not to master...',
                context: 'Checking branch'
            }))
            .then(() => {
                if (newItem.base_branch === 'master') {
                    return repo.updateStatus(newItem.sha, {
                        state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Verifying PR is not to master...',
                        context: 'Checking branch'
                    })
                    .then(() => {
                        // comment message 'Pull request sent to master, closed pull request.'
                        return repo.updatePullRequest(newItem.issue_number,{state:'closed'});
                    });

                } else if (newItem.contributor !== 'openanthem-admin'){
                    return repo.updateStatus(newItem.sha, {
                        state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Pull Request is not to master...',
                        context: 'Checking branch'
                    });
                } else {
                    return repo.updateStatus(newItem.sha, {
                        state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Open Anthem Team request, skipping validation...',
                        context: 'Checking branch'
                    });
                }
            })
            .then(() => {
                if (newItem.base_branch === 'develop') {
                    return repo.updateStatus(newItem.sha, {
                        state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Pull Request is to develop branch...',
                        context: 'Checking branch'
                    });
                } else if (newItem.contributor !== "openanthem-admin"){
                    return repo.updateStatus(newItem.sha, {
                            state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'PR is to develop branch...',
                            context: 'Checking branch'
                        })
                        .then(() => {
                            // comment message: 'Pull request was not made to develop branch, closing pull request'
                            return repo.updatePullRequest(newItem.issue_number,{state:'closed'});
                        });
                } else {
                    return repo.updateStatus(newItem.sha, {
                        state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: 'Open Anthem Team request, skipping validation...',
                        context: 'Checking branch'
                    });
                }
            })
            .then(() => repo.updateStatus(newItem.sha, {
                state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                description: 'Creating internal tracking...',
                context: 'Syncronizing Pull Request to Open Anthem Team'
            }))
            .then(() => {
                return createJiraIssue(newItem)
                    .then((err,results) => {
                        if (err) {
                            return repo.updateStatus(newItem.sha, {
                                state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                                description: 'Failed to create internal tracking...',
                                context: 'Syncronizing Pull Request to Open Anthem Team',
                            });
                        } else {
                            newItem.jira_key = results.key;
                            newItem.jiraIssue_url = results.self;
                            return repo.updateStatus(newItem.sha, {
                                state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                                description: 'Created internal tracking...',
                                context: 'Syncronizing Pull Request to Open Anthem Team',
                                target_url: newItem.jiraIssue_url
                            });
                        }
                    });
            })
            .then(() => repo.updateStatus(newItem.sha, {
                state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                description: 'Creating internal tracking...',
                context: 'Syncronizing Pull Request to Open Anthem Team'
            }))
            .then(() => repo.updateStatus(newItem.sha, {
                state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                description: 'Building and testing changes...',
                context: 'Build and Test'
            }))
            .then(() => {
                const buildParams = {"executeAllStages": true};
                const urlParams = {
                    "os_authType": "basic",
                    "bamboo.variable.GITHUB_ISSUE_ID": newItem.issue_number,
                    "bamboo.variable.JIRAISSUE_KEY": newItem.jira_key,
                    "bamboo.variable.GITHUB_SHA": newItem.sha,
                    "bamboo.variable.GITHUBISSUE_KEY": newItem.issue_number,
                    "bamboo.variable.ISSUE_ID": newItem.issue_number,
                    "bamboo.variable.JIRAISSUE_URL": newItem.jiraIssue_url,
                    "bamboo.variable.GITHUB_ISSUE_URL": newItem.issue_url,
                    "bamboo.variable.GITHUB_REPO": newItem.repo,
                    "bamboo.variable.GITHUBISSUE_USER": "openanthem",
                    "bamboo.variable.JIRAISSUE_ID": newItem.jira_key
                };

                return bamboo.buildPlan(`${process.env.BAMBOO_PROJECT}-${process.env.BAMBOO_PLAN}`, urlParams, buildParams);
            })
            .then((error, result) => {
                    if (error) {
                        return repo.updateStatus(newItem.sha, {
                            state: 'failure', //The state of the status. Can be one of: pending, success, error, or failure.
                            description: 'Unable to submit job, try again later...',
                            context: 'Build and Test'
                        });
                        console.log(error, 'Unable to submit job to bamboo');
                        throw new Error('Unable to submit job to bamboo');
                    } else {
                        return repo.updateStatus(newItem.sha, {
                                state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                                description: 'Submitted job, waiting for results...',
                                context: 'Build and Test'
                            })
                            .then(results => {
                                console.log("Result:", result);
                                return results;
                            });
                    }
            })
            .then(bambooResults => {
                return repo.updateStatus(newItem.sha, {
                        state: 'pending', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: `Waiting on build: ${bambooResults.buildNumber}`,
                        context: 'Verifying build',
                        target_url: `https://bamboo.previewmy.net/browse/${bambooResults.buildResultKey}`
                    })
                    .then(() => addCommentBambooBuild(newItem,repo,bambooResults))
                    .then(() => getBuildStatus(newItem,repo,bambooResults))
                    .then(() => repo.updateStatus(newItem.sha, {
                        state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                        description: `Build finished... ${bambooResults.buildNumber}`,
                        context: 'Verifying build',
                        target_url: `https://bamboo.previewmy.net/browse/${bambooResults.buildResultKey}`
                    }));
            });
            .then(() => repo.updateStatus(newItem.sha, {
                state: 'success', //The state of the status. Can be one of: pending, success, error, or failure.
                description: 'Validation Completed successfully...',
                context: 'Pull Request Validation started'
            }))
            .catch(err => {
                console.log(err);
            });
    }
}

handler.on('pull_request', function(event){
    console.log('Processing pull_request');
    checkStatus(event,function(){
        console.log('Finished processing');
    })
});

function buildSyncItem(event) {
    const { number: issue_number, pull_request, repository, sender} = event.payload;
    const { full_name: repoName } = repository;
    const { login: contributor, html_url: contributor_url} = sender;
    const { body, head, issue_url, statuses_url, title } = pull_request;
    const smart_url = `${repoName}#${issue_number}`;
    const description = `
        ${body}

        References: ${repoName}#${issue_number}
    `;

    const newItem = {
        contributor,
        contributor_url,
        description,
        base_branch: base.ref,
        jira_key: '',
        jiraIssue_url: '',
        issue_number,
        issue_url,
        pr_branch: head.ref,
        repo: repoName,
        sha: head.sha,
        smart_url,
        statuses_url,
        title
    };

    return newItem;
}
