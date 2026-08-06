import blessed from "blessed";


type Node =
    | MenuNode
    | BoolNode
    | RadioNode;


interface MenuNode {
    type: "menu";
    title: string;
    children: Node[];
}


interface BoolNode {
    type: "bool";
    title: string;
    value: boolean;
}


interface RadioNode {
    type: "radio";
    title: string;
    group: string;
    value: boolean;
}


const root: MenuNode = {
    type: "menu",
    title: "Main Menu",
    children: [
        {
            type: "menu",
            title: "General Setup",
            children: [
                {
                    type: "bool",
                    title: "Enable Logging",
                    value: true
                },
                {
                    type: "bool",
                    title: "Verbose Output",
                    value: false
                },
                {
                    type: "menu",
                    title: "System Features",
                    children: [
                        {
                            type: "bool",
                            title: "ACPI Support",
                            value: true
                        },
                        {
                            type: "bool",
                            title: "Power Management",
                            value: false
                        }
                    ]
                }
            ]
        },

        {
            type: "menu",
            title: "Networking",
            children: [
                {
                    type: "radio",
                    title: "IPv4",
                    group: "ip",
                    value: true
                },
                {
                    type: "radio",
                    title: "IPv6",
                    group: "ip",
                    value: false
                },
                {
                    type: "bool",
                    title: "Firewall",
                    value: true
                }
            ]
        },

        {
            type: "menu",
            title: "Filesystem",
            children: [
                {
                    type: "radio",
                    title: "ext4",
                    group: "fs",
                    value: true
                },
                {
                    type: "radio",
                    title: "btrfs",
                    group: "fs",
                    value: false
                },
                {
                    type: "radio",
                    title: "xfs",
                    group: "fs",
                    value: false
                }
            ]
        }
    ]
};


interface VisibleNode {
    node: Node;
    depth: number;
}


const screen = blessed.screen({
    smartCSR: true,
    title: "Linux Kernel Configuration"
});


const frame = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    border: "line"
});


const body = blessed.box({
    top: 1,
    left: 2,
    width: "100%-4",
    height: "100%-5",
    tags: true
});


const footer = blessed.box({
    bottom: 1,
    left: 2,
    width: "100%-4",
    height: 1,
    tags: true,
    content:
        "↑↓ Navigate   → Enter Menu   ← Back   Space Toggle   F10 Exit"
});


screen.append(frame);
screen.append(body);
screen.append(footer);


let current: MenuNode = root;
let cursor = 0;


function visible(menu: MenuNode): VisibleNode[] {
    return menu.children.map(node => ({
        node,
        depth: 0
    }));
}


function currentItem(): Node | undefined {
    return current.children[cursor];
}


function symbol(node: Node): string {

    if (node.type === "menu")
        return "---> ";

    if (node.type === "bool")
        return node.value
            ? "[*] "
            : "[ ] ";

    if (node.type === "radio")
        return node.value
            ? "(*) "
            : "( ) ";

    return "";
}


function draw() {

    const width =
        Math.max(
            10,
            Number(screen.width) - 4
        );


    const title =
        ` ${current.title} ---> `;


    const padding =
        Math.max(
            0,
            Math.floor(
                (width - title.length) / 2
            )
        );


    let output =
        " ".repeat(padding)
        + title
        + "\n\n";


    current.children.forEach(
        (node, index) => {

            let line =
                symbol(node)
                + node.title;


            if (index === cursor) {
                line =
                    `{inverse} ${line.padEnd(width - 2)} {/inverse}`;
            }


            output += line + "\n";
        }
    );


    body.setContent(output);

    screen.render();
}



function setRadio(node: RadioNode) {

    function walk(menu: MenuNode) {

        for (const child of menu.children) {

            if (
                child.type === "radio" &&
                child.group === node.group
            ) {
                child.value = false;
            }

            if (child.type === "menu")
                walk(child);
        }
    }


    walk(root);

    node.value = true;
}



function activate() {

    const node = currentItem();

    if (!node)
        return;


    if (node.type === "menu") {
        current = node;
        cursor = 0;
        return;
    }


    if (node.type === "bool") {
        node.value = !node.value;
        return;
    }


    if (node.type === "radio") {
        setRadio(node);
    }
}



screen.key(
    [
        "up",
        "down",
        "left",
        "right",
        "enter",
        "escape",
        "space",
        "f10"
    ],
    (_, key) => {


        if (key.name === "f10") {
            process.exit(0);
        }


        if (key.name === "up") {
            cursor =
                Math.max(
                    0,
                    cursor - 1
                );
        }


        if (key.name === "down") {
            cursor =
                Math.min(
                    current.children.length - 1,
                    cursor + 1
                );
        }


        if (
            key.name === "enter" ||
            key.name === "right" ||
            key.name === "space"
        ) {
            activate();
        }


        if (
            key.name === "left" ||
            key.name === "escape"
        ) {

            if (current !== root) {

                function findParent(
                    parent: MenuNode,
                    target: MenuNode
                ): MenuNode | undefined {

                    for (const child of parent.children) {

                        if (child === target)
                            return parent;

                        if (child.type === "menu") {

                            const found =
                                findParent(
                                    child,
                                    target
                                );

                            if (found)
                                return found;
                        }
                    }

                    return undefined;
                }


                current =
                    findParent(
                        root,
                        current
                    ) ?? root;

                cursor = 0;
            }
        }


        draw();
    }
);


screen.on("resize", draw);


draw();