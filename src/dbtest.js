/// <reference path="../types/aiwebengine.d.ts" />

// dbtest.js
// New script created at 2025-12-14T08:17:31.242Z

function handler(req) {
    return {
        status: 200,
        body: 'Hello from dbtest.js!',
        contentType: 'text/plain; charset=UTF-8'
    };
}

function init(context) {
    console.log('Initializing dbtest.js at ' + new Date().toISOString());
    database.createTable('dbtest');
    database.addIntegerColumn('dbtest', 'age');
    database.addTextColumn('dbtest', 'name');
    routeRegistry.registerRoute('/dbtest', 'handler', 'GET');
    console.log('dbtest.js endpoints registered');
    return { success: true };
}