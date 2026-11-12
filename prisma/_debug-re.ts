const tests = ["NFR-01 Performance and Latency", "FR-01: Client-Side PDF Parsing"];
const re1 = /^[A-Z]{1,4}\s?-\s?\d+/;
const re2 = /^[-\u2013\u20140-9\[({!\]]/;
for (const t of tests) {
  console.log(JSON.stringify(t), re1.test(t), re2.test(t));
}
