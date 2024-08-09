function makeFunc() {
    let name = 1
    function displayName() {
        console.log(name);
    }
    // displayName();
    name = 2;
    return displayName;
}

const myFunc = makeFunc();
// Hypothesis: output will be "Mozilla" still.
myFunc();
