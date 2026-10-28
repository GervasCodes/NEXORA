// A scriptable stand-in for a mysql2 connection. Each rule is [regex, handler];
// the first rule whose regex matches the SQL answers. Every call is recorded so a
// test can assert what was written. Unmatched SQL fails loudly so a new query in
// the code under test can't slip through unnoticed.
exports.fakeConn = (rules) => {
    const calls = [];
    const conn = {
        calls,
        query: jest.fn(async (sql, params = []) => {
            calls.push({ sql: String(sql), params });
            for (const [re, fn] of rules) {
                if (re.test(sql)) return typeof fn === "function" ? fn(params, sql) : fn;
            }
            throw new Error(`fakeConn: no rule for SQL: ${String(sql).slice(0, 120)}`);
        }),
        // helpers for assertions
        writes: (re) => calls.filter((c) => re.test(c.sql))
    };
    return conn;
};
