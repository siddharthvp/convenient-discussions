/**
 * Comment thread class.
 *
 * @module Thread
 */

import CdError from './CdError';
import cd from './cd';
import { ElementsTreeWalker } from './treeWalker';
import { getUserGenders } from './apiWrappers';
import { getVisibilityByRects, removeFromArrayIfPresent } from './util';

let isInited = false;

let threadLinesContainer;
let treeWalker;

/**
 * Find the closest item (`<li>`, `<dd>`) element for a comment part.
 *
 * @param {Element} commentPartElement
 * @param {number} level
 * @returns {Element}
 */
function findItemElement(commentPartElement, level) {
  if (!treeWalker) {
    treeWalker = new ElementsTreeWalker();
  }
  treeWalker.currentNode = commentPartElement;

  let item;
  let previousNode = commentPartElement;
  do {
    if (treeWalker.currentNode.classList.contains('cd-commentLevel')) {
      const match = treeWalker.currentNode.getAttribute('class').match(/cd-commentLevel-(\d+)/);
      if (match && Number(match[1]) === level) {
        item = previousNode;
        break;
      }
    }
    previousNode = treeWalker.currentNode;
  } while (treeWalker.parentNode());

  return item;
}

export default class Thread {
  /**
   * Create a comment thread object.
   *
   * @param {Comment} rootComment Root comment of the thread.
   */
  constructor(rootComment) {
    this.rootComment = rootComment;

    if (this.rootComment.level === 0) {
      throw new CdError();
    }

    const nextToLastCommentId = cd.comments
      .slice(rootComment.id + 1)
      .find((comment) => (
        comment.level <= rootComment.level ||
        comment.section !== rootComment.section
      ))
      ?.id;
    const lastCommentId = nextToLastCommentId ? nextToLastCommentId - 1 : cd.comments.length - 1;
    this.lastComment = cd.comments[lastCommentId];
    this.commentCount = lastCommentId - this.rootComment.id + 1;
    const startItem = findItemElement(rootComment.elements[0], rootComment.level);
    const endItem = findItemElement(
      this.lastComment.elements[this.lastComment.elements.length - 1],
      rootComment.level
    );

    if (startItem && endItem) {
      this.startItem = startItem;
      this.endItem = endItem;
    } else {
      throw new CdError();
    }
  }

  createLine() {
    const clickArea = document.createElement('div');
    clickArea.className = 'cd-threadLine-clickArea';
    clickArea.title = cd.s('thread-tooltip');
    clickArea.onclick = () => {
      this.toggle();
    };

    const line = document.createElement('div');
    line.className = 'cd-threadLine';
    clickArea.appendChild(line);

    this.clickArea = clickArea;
    this.line = line;
  }

  collapse() {
    const range = document.createRange();
    range.setStart(this.startItem, 0);
    const rangeEnd = this.lastComment.replyForm ?
      findItemElement(this.lastComment.replyForm.$element.get(0), this.lastComment.level) :
      this.endItem;
    range.setEnd(rangeEnd, rangeEnd.childNodes.length);

    const rangeContents = [range.startContainer];
    if (range.commonAncestorContainer !== range.startContainer) {
      treeWalker.currentNode = range.startContainer;
      while (treeWalker.nextSibling() && treeWalker.currentNode !== range.endContainer) {
        rangeContents.push(treeWalker.currentNode);
      }
      if (treeWalker.currentNode !== range.endContainer) {
        while (treeWalker.currentNode.parentNode !== range.commonAncestorContainer) {
          treeWalker.parentNode();
        }
        treeWalker.nextSibling();
        while (!treeWalker.currentNode.contains(range.endContainer)) {
          rangeContents.push(treeWalker.currentNode);
          treeWalker.nextSibling();
        }
        while (
          treeWalker.currentNode.contains(range.endContainer) &&
          treeWalker.currentNode !== range.endContainer
        ) {
          treeWalker.firstChild();
        }
        while (treeWalker.currentNode !== range.endContainer) {
          rangeContents.push(treeWalker.currentNode);
          treeWalker.nextSibling();
        }
      }
      rangeContents.push(range.endContainer);
    }

    this.$collapsedRange = $(rangeContents)
      // We use a class here because there can be elements in the comment that are hidden from the
      // beginning and should stay so when reshowing the comment.
      .addClass('cd-hidden')

      .each((i, el) => {
        // An element can be in more than one collapsed range. So, we need to show it when expanding
        // a range only if no active collapsed ranges are left.
        const $el = $(el);
        const roots = $el.data('cd-collapsed-thread-root-comments') || [];
        roots.push(this.rootComment);
        $el.data('cd-collapsed-thread-root-comments', roots);
      });
    this.isCollapsed = true;
    for (let i = this.rootComment.id; i <= this.lastComment.id; i++) {
      const comment = cd.comments[i];
      comment.isCollapsed = true;
      comment.removeLayers();
    }

    const button = new OO.ui.ButtonWidget({
      // Isn't displayed
      label: 'Expand the thread',

      framed: false,
      classes: ['cd-button', 'cd-threadButton', 'cd-threadButton-invisible'],
    });
    button.on('click', () => {
      this.expand();
    });
    const author = this.rootComment.author;
    const setLabel = (genderless) => {
      let messageName = genderless ? 'thread-expand-genderless' : 'thread-expand';
      button.setLabel(cd.s(messageName, this.commentCount, author.name, author));
      button.$element.removeClass('cd-threadButton-invisible');
    };
    if (cd.g.GENDER_AFFECTS_USER_STRING) {
      getUserGenders([author]).then(setLabel, () => {
        // Couldn't get the gender, use the genderless version.
        setLabel(true);
      });
    } else {
      setLabel();
    }

    this.$collapsedNote = $(`<${$(range.startContainer).prop('tagName')}>`)
      .addClass('cd-thread-collapsedNote')
      .append(button.$element)
      .insertBefore(this.$collapsedRange.first())
      .cdScrollIntoView();

    // For use in Thread#updateLines where we don't use jQuery for performance reasons.
    this.collapsedNote = this.$collapsedNote.get(0);
  }

  expand() {
    this.$collapsedRange.each((i, el) => {
      const $el = $(el);
      const roots = $el.data('cd-collapsed-thread-root-comments') || [];
      removeFromArrayIfPresent(roots, this.rootComment);
      $el.data('cd-collapsed-thread-root-comments', roots);
      if (!roots.length) {
        $el.removeClass('cd-hidden');
      }
    });

    this.isCollapsed = false;
    for (let i = this.rootComment.id; i <= this.lastComment.id; i++) {
      const comment = cd.comments[i];
      if (comment.thread.isCollapsed) {
        i = comment.thread.lastComment + 1;
        continue;
      }
      comment.isCollapsed = false;
    }
    this.$collapsedNote.remove();
  }

  toggle() {
    this[this.isCollapsed ? 'expand' : 'collapse']();
  }

  static init() {
    cd.debug.startTimer('threads');
    cd.debug.startTimer('traverse');

    cd.comments
      .filter((comment) => comment.level)
      .forEach((rootComment) => {
        try {
          rootComment.thread = new Thread(rootComment);
        } catch (e) {
          // Empty
        }
      });

    cd.debug.stopTimer('traverse');

    if (threadLinesContainer) {
      threadLinesContainer.innerHTML = '';
    } else {
      threadLinesContainer = document.createElement('div');
      threadLinesContainer.className = 'cd-threadLinesContainer';
      document.body.appendChild(threadLinesContainer);
    }
    Thread.updateLines();
    isInited = true;

    cd.debug.stopTimer('threads');
  }

  static updateLines() {
    cd.debug.startTimer('threads update');
    cd.debug.startTimer('threads calculate');

    const elements = [];
    let lastAffectedComment;
    cd.comments
      .slice()
      .reverse()
      .some((comment) => {
        if (!comment.thread) return;

        cd.debug.startTimer('threads getBoundingClientRect');

        const thread = comment.thread;
        const elementTop = thread.isCollapsed ? thread.collapsedNote : thread.startItem;
        const rectTop = elementTop.getBoundingClientRect();

        let elementBottom;
        if (thread.isCollapsed) {
          elementBottom = thread.collapsedNote;
        } else {
          if (thread.lastComment.replyForm) {
            elementBottom = findItemElement(
              thread.lastComment.replyForm.$element.get(0),
              thread.lastComment.level
            );
          } else {
            elementBottom = thread.endItem;
          }
        }

        const rectBottom = elementBottom.getBoundingClientRect();

        if (
          window.scrollY + rectTop.top === thread.lineTop &&
          rectBottom.bottom - rectTop.top === thread.lineHeight
        ) {
          // Find the first comment counting from 0 that is affected by the change of positions and
          // stop at it.
          if (
            !lastAffectedComment ||
            comment.level === 1 ||
            comment.section !== lastAffectedComment.section
          ) {
            return true;
          }
          cd.debug.stopTimer('threads getBoundingClientRect');
          return false;
        }

        if (!getVisibilityByRects(rectTop, rectBottom)) {
          if (thread.line) {
            thread.clickArea.remove();
            thread.clickArea = null;
            thread.line = null;
            thread.lineLeft = null;
            thread.lineTop = null;
            thread.lineHeight = null;
          }
          return false;
        }

        cd.debug.stopTimer('threads getBoundingClientRect');
        cd.debug.startTimer('threads createElement');

        thread.lineLeft = window.scrollX + rectTop.left - cd.g.CONTENT_FONT_SIZE;
        thread.lineTop = window.scrollY + rectTop.top;
        thread.lineHeight = rectBottom.bottom - rectTop.top;

        if (!thread.line) {
          thread.createLine();
        }

        thread.clickArea.style.left = thread.lineLeft + 'px';
        thread.clickArea.style.top = thread.lineTop + 'px';
        thread.clickArea.style.height = thread.lineHeight + 'px';

        if (!isInited) {
          elements.push(thread.clickArea);
        } else if (!thread.clickArea.parentNode) {
          threadLinesContainer.append(thread.clickArea);
        }

        lastAffectedComment = comment;

        cd.debug.stopTimer('threads createElement');

        return false;
      });

    cd.debug.stopTimer('threads calculate');
    cd.debug.startTimer('threads append');

    if (!isInited) {
      threadLinesContainer.append(...elements);
    }

    cd.debug.stopTimer('threads append');
    cd.debug.stopTimer('threads update');
  }
}