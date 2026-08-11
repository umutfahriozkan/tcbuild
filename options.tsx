import blessed from "blessed";

/* -------------------------------------------------------------------------- */
/* Model                                                                      */
/* -------------------------------------------------------------------------- */

type Node =
    | MenuNode
    | BoolNode
    | RadioNode;

interface BaseNode {
    title: string;
}

interface MenuNode extends BaseNode {
    type: "menu";
    children: Node[];
}

interface BoolNode extends BaseNode {
    type: "bool";
    value: boolean;
}

interface RadioNode extends BaseNode {
    type: "radio";
    group: string;
    value: boolean;
}

/* -------------------------------------------------------------------------- */
/* Configuration                                                              */
/* -------------------------------------------------------------------------- */

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
                    value: true,
                },
                {
                    type: "bool",
                    title: "Verbose Output",
                    value: false,
                },
                {
                    type: "menu",
                    title: "System Features",

                    children: [
                        {
                            type: "bool",
                            title: "ACPI Support",
                            value: true,
                        },
                        {
                            type: "bool",
                            title: "Power Management",
                            value: false,
                        },
                    ],
                },
            ],
        },

        {
            type: "menu",
            title: "Networking",

            children: [
                {
                    type: "radio",
                    title: "IPv4",
                    group: "ip",
                    value: true,
                },
                {
                    type: "radio",
                    title: "IPv6",
                    group: "ip",
                    value: false,
                },
                {
                    type: "bool",
                    title: "Firewall",
                    value: true,
                },
            ],
        },

        {
            type: "menu",
            title: "Filesystem",

            children: [
                {
                    type: "radio",
                    title: "ext4",
                    group: "fs",
                    value: true,
                },
                {
                    type: "radio",
                    title: "btrfs",
                    group: "fs",
                    value: false,
                },
                {
                    type: "radio",
                    title: "xfs",
                    group: "fs",
                    value: false,
                },
            ],
        },
    ],
};

/* -------------------------------------------------------------------------- */
/* Screen                                                                     */
/* -------------------------------------------------------------------------- */

const screen = blessed.screen({
    smartCSR: true,
    title: "Linux Kernel Configuration",
    fullUnicode: true,
    dockBorders: true,
});

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

const frame = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",

    border: {
        type: "line",
    },

    style: {
        border: {
            fg: "white",
        },
    },
});

const header = blessed.box({
    top: 1,
    left: 2,
    width: "100%-4",
    height: 1,

    tags: true,
    align: "center",
});

const body = blessed.box({
    top: 3,
    left: 2,
    width: "100%-4",
    height: "100%-7",

    tags: true,
    scrollable: false,
});

const footer = blessed.box({
    bottom: 1,
    left: 2,
    width: "100%-4",
    height: 2,

    tags: true,
    align: "center",

    content:
        " ↑↓ Navigate   →/Enter Select   ←/Esc Back   Space Toggle   F10 Exit ",
});

screen.append(frame);
screen.append(header);
screen.append(body);
screen.append(footer);

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

interface MenuState {
    menu: MenuNode;
    cursor: number;
    scroll: number;
}

const states: MenuState[] = [
    {
        menu: root,
        cursor: 0,
        scroll: 0,
    },
];

function state(): MenuState {
    return states[states.length - 1];
}

function currentMenu(): MenuNode {
    return state().menu;
}

function currentNode(): Node | undefined {
    return currentMenu().children[state().cursor];
}

function enterMenu(menu: MenuNode) {
    states.push({
        menu,
        cursor: 0,
        scroll: 0,
    });
}

function leaveMenu() {
    if (states.length > 1)
        states.pop();
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

function toggleRadio(node: RadioNode) {
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

function activate(node: Node | undefined) {
    if (!node)
        return;

    switch (node.type) {
        case "menu":
            enterMenu(node);
            break;

        case "bool":
            node.value = !node.value;
            break;

        case "radio":
            toggleRadio(node);
            break;
    }
}

/* -------------------------------------------------------------------------- */
/* Scrolling                                                                  */
/* -------------------------------------------------------------------------- */

function visibleHeight(): number {
    return Math.max(
        1,
        Number(body.height),
    );
}

function ensureCursorVisible() {
    const current = state();
    const height = visibleHeight();

    if (current.cursor < current.scroll) {
        current.scroll = current.cursor;
    }

    if (current.cursor >= current.scroll + height) {
        current.scroll =
            current.cursor - height + 1;
    }

    const maxScroll = Math.max(
        0,
        current.menu.children.length - height,
    );

    current.scroll = Math.min(
        current.scroll,
        maxScroll,
    );
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function symbol(node: Node): string {
    switch (node.type) {
        case "menu":
            return " ---> ";

        case "bool":
            return node.value
                ? " [*] "
                : " [ ] ";

        case "radio":
            return node.value
                ? " (*) "
                : " ( ) ";
    }
}

function titleLine(title: string, width: number): string {
    const text = ` ${title} ---> `;

    if (text.length >= width)
        return text.slice(0, width);

    const padding =
        Math.floor((width - text.length) / 2);

    return (
        " ".repeat(padding) +
        text
    );
}

function draw() {
    const width = Math.max(
        1,
        Number(body.width),
    );

    const current = state();

    ensureCursorVisible();

    /* Header */

    header.setContent(
        `{bold}${titleLine(
            current.menu.title,
            width,
        )}{/bold}`,
    );

    /* Body */

    const children = current.menu.children;

    const height = visibleHeight();

    const start = current.scroll;

    const end = Math.min(
        children.length,
        start + height,
    );

    const lines: string[] = [];

    for (let i = start; i < end; i++) {
        const node = children[i];

        let line =
            symbol(node) +
            node.title;

        /*
         * Keep one character of padding on each side
         * when highlighting the current item.
         */

        const availableWidth =
            Math.max(1, width - 2);

        if (line.length > availableWidth) {
            line =
                line.slice(
                    0,
                    availableWidth - 1,
                ) + "…";
        }

        line = line.padEnd(
            availableWidth,
            " ",
        );

        if (i === current.cursor) {
            line =
                `{inverse} ${line} {/inverse}`;
        } else {
            line = ` ${line} `;
        }

        lines.push(line);
    }

    /*
     * Clear unused rows when the menu is shorter
     * than the available terminal height.
     */

    while (lines.length < height) {
        lines.push("");
    }

    body.setContent(
        lines.join("\n"),
    );

    /* Footer */

    const selected = currentNode();

    let hint =
        " ↑↓ Navigate ";

    if (selected?.type === "menu") {
        hint += " →/Enter Select ";
    } else {
        hint += " Space Toggle ";
    }

    hint += " ←/Esc Back   F10 Exit ";

    footer.setContent(hint);

    screen.render();
}

/* -------------------------------------------------------------------------- */
/* Keyboard                                                                   */
/* -------------------------------------------------------------------------- */

function moveCursor(delta: number) {
    const current = state();

    if (current.menu.children.length === 0)
        return;

    current.cursor += delta;

    current.cursor = Math.max(
        0,
        Math.min(
            current.menu.children.length - 1,
            current.cursor,
        ),
    );

    ensureCursorVisible();
}

function handleKey(
    _: unknown,
    // @ts-ignore
    key: blessed.Widgets.Events.IKeyEvent,
) {
    switch (key.name) {
        case "up":
            moveCursor(-1);
            break;

        case "down":
            moveCursor(1);
            break;

        case "enter":
        case "right":
            activate(currentNode());
            break;

        case "space": {
            const node = currentNode();

            if (
                node &&
                node.type !== "menu"
            ) {
                activate(node);
            }

            break;
        }

        case "left":
        case "escape":
            leaveMenu();
            break;

        case "f10":
        case "q":
            shutdown();
            return;
    }

    draw();
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

function shutdown() {
    screen.destroy();
    process.exit(0);
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
        "f10",
        "q",
    ],
    handleKey,
);

screen.on("resize", () => {
    draw();
});

process.on("SIGINT", shutdown);

/* -------------------------------------------------------------------------- */
/* Start                                                                      */
/* -------------------------------------------------------------------------- */

draw();
