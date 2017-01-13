var MASTER_PLAN_NAME, PR_PLAN_NAME, actionTypes, bambooPassword, bambooUser, eventTypes, gitHubApiToken, pathUtil, queryString, url,
    indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

url = require('url');

pathUtil = require('path');

queryString = require('querystring');

actionTypes = ['opened', 'synchronize', 'reopened', 'closed'];

eventTypes = ['pull_request'];

PR_PLAN_NAME = "DDF-PRINC";

MASTER_PLAN_NAME = "DDF-MSTRINC";

bambooUser = process.env.bamboo_user;

bambooPassword = process.env.bamboo_pass;

gitHubApiToken = process.env.github_api_token;

module.exports = function(robot) {
    var computeChangedModules, delayHandler, getBambooUrl, getChangedPaths, getPlanName, isSubmitSuccessful, removeDuplicatePaths, removeFileName, retrieveChangedModules, retrieveMavenModules, submitBuildRequest, updateGitHubStatus;
    getBambooUrl = function(request, response) {
        var bambooUrl, query;
        query = queryString.parse(url.parse(request.url).query);
        bambooUrl = query.bamboo;
        if (bambooUrl == null) {
            console.log("[ERROR] Bad request. Missing 'bamboo' parameter in query string");
            response.writeHead(400);
            response.end("Missing parameters in query string\n");
        }
        return bambooUrl;
    };
    getPlanName = function(eventPayload) {
        var prClosed, prMerged;
        prClosed = eventPayload.action === "closed";
        prMerged = eventPayload.pull_request.merged;
        if (prClosed && prMerged) {
            return MASTER_PLAN_NAME;
        } else {
            return PR_PLAN_NAME;
        }
    };
    removeFileName = function(path) {
        return pathUtil.dirname(path);
    };
    removeDuplicatePaths = function(paths, path) {
        if (indexOf.call(paths, path) < 0) {
            return paths.concat(path);
        } else {
            return paths;
        }
    };
    getChangedPaths = function(files) {
        var changedPaths, obj;
        changedPaths = (function() {
            var i, len, results;
            results = [];
            for (i = 0, len = files.length; i < len; i++) {
                obj = files[i];
                if (obj.status !== "removed") {
                    results.push(removeFileName(obj.filename));
                }
            }
            return results;
        })();
        changedPaths = changedPaths.reduce(removeDuplicatePaths, []);
        changedPaths.sort().reverse();
        console.log("[INFO] Changed files:");
        console.log(changedPaths);
        return changedPaths;
    };
    computeChangedModules = function(modules, changedPaths) {
        var changedPath, i, j, len, len1, module, modulesToBuild;
        console.log("[INFO] PR modules:");
        console.log(modules);
        modulesToBuild = [];
        for (i = 0, len = changedPaths.length; i < len; i++) {
            changedPath = changedPaths[i];
            for (j = 0, len1 = modules.length; j < len1; j++) {
                module = modules[j];
                if (!(changedPath.match("^" + module + ".*"))) {
                    continue;
                }
                if (indexOf.call(modulesToBuild, module) < 0) {
                    modulesToBuild.push(module);
                }
                break;
            }
        }
        if (modulesToBuild.length === 0) {
            modulesToBuild = ["."];
        }
        console.log("[INFO] Modules to build:");
        console.log(modulesToBuild);
        return modulesToBuild;
    };
    isSubmitSuccessful = function(responseBody) {
        return !responseBody.hasOwnProperty("status-code");
    };
    updateGitHubStatus = function(url, state, description, targetUrl) {
        return robot.http(url).header('Authorization', "token " + gitHubApiToken).post(JSON.stringify({
            "state": state,
            "context": "bamboo",
            "description": description,
            "target_url": targetUrl
        }));
    };
    submitBuildRequest = function(bambooUrl, eventPayload, modulesToBuild, planName) {
        var bambooQuery;
        bambooQuery = (bambooUrl + "/rest/api/latest/queue/" + planName + "?") + queryString.stringify({
                "bamboo.variable.pull_ref": eventPayload.pull_request.head.ref,
                "bamboo.variable.pull_sha": eventPayload.pull_request.head.sha,
                "bamboo.variable.pull_num": eventPayload.number,
                "bamboo.variable.git_repo_url": eventPayload.repository.clone_url,
                "bamboo.variable.modules": modulesToBuild.join()
            });
        console.log("[DEBUG] Bamboo Query: " + bambooQuery);
        return robot.http(bambooQuery).auth(bambooUser, bambooPassword).header('Accept', 'application/json').header('X-Atlassian-Token', 'no-check').post()(function(error, response, body) {
            var jsonBody;
            if (error) {
                console.log("[ERROR] Failed to submit Bamboo build request: " + error);
                updateGitHubStatus(eventPayload.pull_request.statuses_url, "failure", "Failed to submit Bamboo build request: " + error, "");
                return;
            }
            jsonBody = JSON.parse(body);
            if (isSubmitSuccessful(jsonBody)) {
                return updateGitHubStatus(eventPayload.pull_request.statuses_url, "pending", "A Bamboo build has been queued", bambooUrl + "/browse/" + jsonBody.buildResultKey);
            } else {
                console.log("[ERROR] Failed to submit Bamboo build, request: " + body);
                return updateGitHubStatus(eventPayload.pull_request.statuses_url, "failure", "" + jsonBody.message, bambooUrl + "/browse/" + planName);
            }
        });
    };
    retrieveMavenModules = function(gitHubUrl, sha, statusUrl, callback) {
        return robot.http(gitHubUrl + "/git/trees/" + sha + "?recursive=1").get()(function(error, response, body) {
            var gitTree, modules, obj, rateLimitRemaining;
            if (error) {
                console.log("[ERROR] Failed to retrieve list of directories from GitHub: " + error);
                updateGitHubStatus(statusUrl, "failure", "Failed to retrieve list of directories from GitHub: " + error, "");
                return;
            }
            rateLimitRemaining = parseInt(response.headers['x-ratelimit-remaining']);
            if (rateLimitRemaining && rateLimitRemaining < 1) {
                console.log("[ERROR] Failed to retrieve list of directories from GitHub: Rate Limit hit.");
                updateGitHubStatus(statusUrl, "failure", "Failed to retrieve list of directories from GitHub: Rate Limit hit.", "");
                return;
            }
            gitTree = JSON.parse(body);
            if (gitTree.truncated === "true" || (gitTree.tree == null)) {
                console.log("[ERROR] Failed to retrieve all directories from GitHub.");
                updateGitHubStatus(statusUrl, "failure", "Failed to retrieve all directories from GitHub.", "");
                return;
            }
            modules = (function() {
                var i, len, ref, results;
                ref = gitTree.tree;
                results = [];
                for (i = 0, len = ref.length; i < len; i++) {
                    obj = ref[i];
                    if ((obj.path != null) && obj.path.match(".*\\bpom.xml$") && !obj.path.match(".*/resources/.*")) {
                        results.push(removeFileName(obj.path));
                    }
                }
                return results;
            })();
            modules.sort().reverse();
            return callback(modules);
        });
    };
    retrieveChangedModules = function(gitHubUrl, prNumber, modules, statusUrl, callback) {
        return robot.http(gitHubUrl + "/pulls/" + prNumber + "/files?per_page=100").get()(function(error, response, body) {
            var changedPaths, modulesToBuild;
            if (error) {
                console.log("[ERROR] Failed to retrieve changed files for PR: " + error);
                updateGitHubStatus(statusUrl, "failure", "Failed to retrieve changed files for PR: " + error, "");
                return;
            }
            if (response.headers.link) {
                console.log("[INFO] More than 100 changed files in the PR. Building all modules.");
                modulesToBuild = ["."];
            } else {
                changedPaths = getChangedPaths(JSON.parse(body));
                modulesToBuild = computeChangedModules(modules, changedPaths);
            }
            return callback(modulesToBuild);
        });
    };
    delayHandler = function(seconds) {
        return function(request, response, next) {
            return setTimeout(next, seconds * 1000);
        };
    };
    return robot.router.post("/hubot/trigger-bamboo", delayHandler(5), function(request, response) {
        var actionType, bambooUrl, error, eventPayload, eventType, gitHubUrl, planName, prNumber, sha, statusUrl;
        console.log("---");
        console.log("[INFO] Request received: " + request.url);
        bambooUrl = getBambooUrl(request, response);
        if (bambooUrl == null) {
            return;
        }
        eventPayload = request.body;
        actionType = eventPayload.action;
        eventType = request.headers["x-github-event"];
        if (indexOf.call(eventTypes, eventType) < 0 || indexOf.call(actionTypes, actionType) < 0) {
            return;
        }
        sha = eventPayload.pull_request.head.sha;
        gitHubUrl = eventPayload.repository.url;
        prNumber = eventPayload.number;
        statusUrl = eventPayload.pull_request.statuses_url;
        planName = getPlanName(eventPayload);
        try {
            console.log("[INFO] Processing " + actionType + "/" + eventType + " in repo " + eventPayload.pull_request.html_url + ".");
            retrieveMavenModules(gitHubUrl, sha, statusUrl, function(modules) {
                return retrieveChangedModules(gitHubUrl, prNumber, modules, statusUrl, function(modulesToBuild) {
                    return submitBuildRequest(bambooUrl, eventPayload, modulesToBuild, planName);
                });
            });
        } catch (_error) {
            error = _error;
            console.log("[ERROR] Failed to submit PR build!");
            console.log(error.stack);
            console.log("[ERROR] Event payload:");
            console.log(JSON.stringify(eventPayload));
        }
        return response.end("OK");
    });
};

// ---
// generated by coffee-script 1.9.2