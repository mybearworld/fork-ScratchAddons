/** @param {AddonAPI} */
export default async function ({ addon, console }) {
  /** @type {HTMLElement|null} */
  let currentDraggingElement = null;

  /** @type {WeakMap<HTMLElement, Animation>} */
  const allAnimations = new WeakMap();

  const FORWARD = 1;
  const REVERSE = -1;

  /**
   * @param {HTMLElement} element
   * @param {number} direction
   * @returns {Animation}
   */
  const animateElement = (element, direction) => {
    /** @type {Animation} */
    let animation;
    if (allAnimations.has(element)) {
      animation = allAnimations.get(element);
    } else {
      animation = element.animate(
        [
          {
            // this object intentionally empty so the element animates from whatever its default value
            // is in CSS.
          },
          {
            backgroundColor: "hsla(215, 100%, 77%, 1)",
          },
        ],
        {
          duration: 250,
          fill: "forwards",
          easing: "ease",
        }
      );
      allAnimations.set(element, animation);
    }

    animation.playbackRate = direction;
  };

  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  const reactAwareSetValue = (el, value) => {
    nativeInputValueSetter.call(el, value);
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const globalHandleDragOver = (e) => {
    if (addon.self.disabled) return;

    if (!e.dataTransfer.types.includes("Files")) {
      return;
    }

    let el;
    let callback;
    if (
      (el = e.target.closest('div[class*="sprite-selector_sprite-selector"]')) ||
      (el = e.target.closest('div[class*="stage-selector_stage-selector"]')) ||
      (el = e.target.closest('div[class*="selector_wrapper"]'))
    ) {
      callback = (files) => {
        const hdFilter = addon.settings.get("use-hd-upload") ? "" : ":not(.sa-better-img-uploads-input)";
        const fileInput = el.querySelector('input[class*="action-menu_file-input"]' + hdFilter);
        fileInput.files = files;
        fileInput.dispatchEvent(new Event("change", { bubbles: true }));
      };
    } else if (
      !addon.tab.redux.state.scratchGui.mode.isPlayerOnly &&
      (el = e.target.closest('div[class*="monitor_list-monitor"]'))
    ) {
      callback = (files) => {
        const contextMenuBefore = document.querySelector("body > .react-contextmenu.react-contextmenu--visible");
        // Simulate a right click on the list monitor
        el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        // Get the right click menu that opened (monitor context menus are
        // children of <body>)
        const contextMenuAfter = document.querySelector("body > .react-contextmenu.react-contextmenu--visible");
        // `contextMenuAfter` is only null if the context menu was already open
        // for the list monitor, in which case we can use the context menu from
        // before the simulated right click
        const contextMenu = contextMenuAfter === null ? contextMenuBefore : contextMenuAfter;
        // Sometimes the menu flashes open, so force hide it.
        contextMenu.style.display = "none";
        // Override DOM methods to import the text file directly
        // See: https://github.com/scratchfoundation/scratch-gui/blob/develop/src/lib/import-csv.js#L21-L22
        const appendChild = document.body.appendChild;
        document.body.appendChild = (fileInput) => {
          // Restore appendChild to <body>
          document.body.appendChild = appendChild;
          if (fileInput instanceof HTMLInputElement) {
            document.body.appendChild(fileInput);
            // Prevent Scratch from opening the file input dialog
            fileInput.click = () => {};
            // Insert files from the drop event into the file input
            fileInput.files = files;
            fileInput.dispatchEvent(new Event("change"));
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                contextMenu.style.display = null;
                contextMenu.style.opacity = 0;
                contextMenu.style.pointerEvents = "none";
              });
            });
          } else {
            // The next call for `appendChild` SHOULD be the file input, but if
            // it's not, then make `appendChild` behave as normal.
            console.error('File input was not immediately given to appendChild upon clicking "Import"!');
            return appendChild(fileInput);
          }
        };
        // Simulate clicking on the "Import" option
        contextMenu.children[0].click();
      };
    } else if (
      (el = e.target.closest('div[class*="question_question-input"] > input[class*="input_input-form_l9eYg"]'))
    ) {
      callback = async (files) => {
        const text = (await Promise.all(Array.from(files, (file) => file.text())))
          .join("")
          // Match pasting behavior: remove all newline characters at the end
          .replace(/[\r\n]+$/, "")
          .replace(/\r?\n|\r/g, " ");
        const selectionStart = el.selectionStart;
        reactAwareSetValue(el, el.value.slice(0, selectionStart) + text + el.value.slice(el.selectionEnd));
        el.setSelectionRange(selectionStart, selectionStart + text.length);
      };
    }
    if (!el) {
      return;
    }

    e.preventDefault();

    if (el === currentDraggingElement) {
      return;
    }
    currentDraggingElement = el;

    /** @type {HTMLElement[]} */
    const elementsToAnimate = [
      el,
      el.querySelector('div[class*="stage-selector_header_"]'),
      el.querySelector('div[class*="sprite-info_sprite-info"]'),
      el.querySelector('div[class*="monitor_list-body"]'),
    ].filter((i) => i);
    for (const el of elementsToAnimate) {
      animateElement(el, FORWARD);
    }

    const handleDrop = (e) => {
      e.preventDefault();
      cleanup();
      if (e.dataTransfer.types.includes("Files") && e.dataTransfer.files.length > 0) {
        callback(e.dataTransfer.files);
      }
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    };
    e.dataTransfer.dropEffect = "copy";

    const handleDragLeave = (e) => {
      e.preventDefault();
      cleanup();
    };

    const cleanup = () => {
      currentDraggingElement = null;

      el.removeEventListener("dragover", handleDragOver);
      el.removeEventListener("dragleave", handleDragLeave);
      el.removeEventListener("drop", handleDrop);

      for (const el of elementsToAnimate) {
        animateElement(el, REVERSE);
      }
    };

    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("dragleave", handleDragLeave);
    el.addEventListener("drop", handleDrop);
  };

  document.addEventListener("dragover", globalHandleDragOver, { useCapture: true });
}
