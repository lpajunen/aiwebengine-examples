/// <reference path="../types/aiwebengine.d.ts" />

// jooss.js
// New script created at 2025-11-24T17:06:20.779Z
// Updated to include call counter and navigation links
// Italian and Spanish greetings added
// Polish language support added
// Greek language support added

function incrementCounter() {
  const currentCount = parseInt(sharedStorage.getItem("callCount") || "0", 10);
  const newCount = currentCount + 1;
  sharedStorage.setItem("callCount", newCount.toString());
  return newCount;
}

function getCallCount() {
  return parseInt(sharedStorage.getItem("callCount") || "0", 10);
}

function getNavigationLinks(currentPage) {
  const links = [
    { title: "English", url: "/jooss", active: currentPage === "english" },
    {
      title: "Finnish",
      url: "/jooss/finnish",
      active: currentPage === "finnish",
    },
    {
      title: "Swedish",
      url: "/jooss/swedish",
      active: currentPage === "swedish",
    },
    { title: "German", url: "/jooss/german", active: currentPage === "german" },
    {
      title: "Italian",
      url: "/jooss/italian",
      active: currentPage === "italian",
    },
    {
      title: "Spanish",
      url: "/jooss/spanish",
      active: currentPage === "spanish",
    },
    { title: "Polish", url: "/jooss/polish", active: currentPage === "polish" },
    { title: "Greek", url: "/jooss/greek", active: currentPage === "greek" },
  ];

  let navHtml =
    '<nav style="background-color: #f0f0f0; padding: 10px; margin-bottom: 20px; border-radius: 4px;"><ul style="list-style: none; margin: 0; padding: 0; display: flex; gap: 15px;">';
  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    if (link.active) {
      navHtml +=
        '<li style="font-weight: bold; color: #007acc;">' +
        link.title +
        "</li>";
    } else {
      navHtml +=
        '<li><a href="' +
        link.url +
        '" style="color: #0066cc; text-decoration: none;">' +
        link.title +
        "</a></li>";
    }
  }
  navHtml += "</ul></nav>";
  return navHtml;
}

function handler(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("english");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>Jooss</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>Hi from joosss.js!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function finnishGreeting(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("finnish");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>Finnish Greeting</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>Terve maailma!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function swedishGreeting(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("swedish");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>Swedish Greeting</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>Hej världen!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function germanGreeting(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("german");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>German Greeting</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>Hallo Welt!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function italianGreeting(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("italian");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>Italian Greeting</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>Ciao mondo!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function spanishGreeting(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("spanish");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>Spanish Greeting</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>¡Hola mundo!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function polishGreeting(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("polish");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>Polish Greeting</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>Cześć świecie!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function greekGreeting(req) {
  const count = incrementCounter();
  const navHtml = getNavigationLinks("greek");
  return {
    status: 200,
    body:
      "<!DOCTYPE html><html><head><title>Greek Greeting</title><style>body { font-family: Arial, sans-serif; margin: 20px; }</style></head><body>" +
      navHtml +
      "<h1>Γεια σου κόσμε!</h1><p>Total calls: " +
      count +
      "</p></body></html>",
    contentType: "text/html; charset=UTF-8",
  };
}

function init() {
  console.log("Initializing jooss.js at " + new Date().toISOString());
  routeRegistry.registerRoute("/jooss", "handler", "GET");
  routeRegistry.registerRoute("/jooss/finnish", "finnishGreeting", "GET");
  routeRegistry.registerRoute("/jooss/swedish", "swedishGreeting", "GET");
  routeRegistry.registerRoute("/jooss/german", "germanGreeting", "GET");
  routeRegistry.registerRoute("/jooss/italian", "italianGreeting", "GET");
  routeRegistry.registerRoute("/jooss/spanish", "spanishGreeting", "GET");
  routeRegistry.registerRoute("/jooss/polish", "polishGreeting", "GET");
  routeRegistry.registerRoute("/jooss/greek", "greekGreeting", "GET");
  console.log("jooss.js endpoints registered");
}
