# Purpose
When a user creates a new Pull request, this application will react to GitHub webhook data and perform tasks while updating Git Hub statuses displayed to end users.  During this time, some house keeping is done.  The issue is created with all user provided details inside Jira Cloud instance, within a specified project.  Once issue is created, the Pull Request details are submitted to Bamboo to begin building a PROJECT-PLAN. Job is started, in Bamboo and application will meader around and waiting for build to complete.  

Look at [.env](.env) and review needed settings.

Status results look like screen shot below

![Status Screenshot Example](https://github.com/loudbinary/github-bamboo-integration/raw/master/docs/status-results.png)
