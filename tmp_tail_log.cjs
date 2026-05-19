const fs = require("fs");
const file = process.argv[2] || "storage/logs/laravel.log";
const count = Number(process.argv[3] || 120);
const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
console.log(lines.slice(-count).join("\n"));
