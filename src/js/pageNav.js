/**
 * The block displaying the current section tree according to the scroll position, along with the
 * page top and table of contents links. The bottom block also displays the page bottom link.
 *
 * @module pageNav
 */

import cd from './cd';
import { getExtendedRect, getVisibilityByRects } from './util';
import { handleScroll } from './eventHandlers';

let currentSection;
let $sectionWithBackLink;
let $backLinkContainer;
let backLinkLocation;

export default {
  /**
   * Render the page navigation block. This is done when the page is first loaded.
   */
  mount() {
    this.$topElement = $('<div>')
      .attr('id', 'cd-pageNav-top')
      .addClass('cd-pageNav')
      .appendTo(document.body);
    this.$bottomElement = $('<ul>')
      .attr('id', 'cd-pageNav-bottom')
      .addClass('cd-pageNav cd-pageNav-list')
      .appendTo(document.body);

    this.updateWidth();
    this.update();
  },

  /**
   * Update or set the width of the page nagivation blocks.
   */
  updateWidth() {
    if (cd.g.$contentColumn.length) {
      const left = cd.g.$contentColumn.offset().left;
      let width = $(document.body).hasClass('ltr') ?
        left - 18 :
        $(window).width() - (left + cd.g.$contentColumn.outerWidth()) - 18;
      if (['vector', 'minerva'].includes(cd.g.SKIN)) {
        width -= cd.g.CONTENT_START_MARGIN;
      }

      // Some skins when the viewport narrowed
      if (width <= 100) {
        this.$topElement.hide();
        this.$bottomElement.hide();
      } else {
        this.$topElement.show();
        this.$bottomElement.show();
      }

      this.$topElement.css('width', width + 'px');
      this.$bottomElement.css('width', width + 'px');
    }
  },

  /**
   * Update the contents of the page navigation blocks.
   */
  update() {
    const htmlElement = document.documentElement;
    if (htmlElement.scrollHeight === htmlElement.clientHeight) {
      this.reset();
      return;
    }

    // The top position of TOC or the first section
    let afterLeadPos;

    let firstSectionOuterTop;
    if (cd.g.$toc.length) {
      afterLeadPos = cd.g.$toc.get(0).getBoundingClientRect().top;
    }
    const scrollY = window.scrollY;
    if (scrollY > cd.g.BODY_SCROLL_PADDING_TOP) {
      cd.sections.some((section) => {
        const rect = getExtendedRect(section.$heading.get(0));
        if (!getVisibilityByRects(rect)) {
          return false;

        // The second check to exclude the possibility that the first section is above the TOC, like
        // at https://commons.wikimedia.org/wiki/Project:Graphic_Lab/Illustration_workshop.
        } else if (!afterLeadPos || rect.outerTop > afterLeadPos) {
          firstSectionOuterTop = rect.outerTop;

          if (!afterLeadPos) {
            afterLeadPos = rect.outerTop;
          }
          return true;
        } else {
          return false;
        }
      });
    }

    if (afterLeadPos < cd.g.BODY_SCROLL_PADDING_TOP || backLinkLocation === 'top') {
      if (!this.$linksOnTop) {
        this.$linksOnTop = $('<ul>')
          .attr('id', 'cd-pageNav-linksOnTop')
          .addClass('cd-pageNav-list')
          .appendTo(this.$topElement);
        this.$topLink = $('<li>')
          .attr('id', 'cd-pageNav-topLink')
          .addClass('cd-pageNav-item')
          .text(cd.s('pagenav-pagetop'))
          .on('click', () => {
            this.jump(0, this.$topLink);
          })
          .appendTo(this.$linksOnTop);
      }
    } else {
      if (this.$linksOnTop) {
        this.reset('top');
      }
    }

    if (this.$linksOnTop) {
      if (cd.g.$toc.length && !this.$tocLink) {
        this.$tocLink = $('<li>')
          .attr('id', 'cd-pageNav-tocLink')
          .addClass('cd-pageNav-item')
          .text(cd.s('pagenav-toc'))
          .on('click', () => {
            this.jump(cd.g.$toc, this.$tocLink);
          })
          .appendTo(this.$linksOnTop);
      }
      if (!this.$currentSection) {
        this.$currentSection = $('<ul>')
          .attr('id', 'cd-pageNav-currentSection')
          .addClass('cd-pageNav-list')
          .appendTo(this.$topElement);
      }
    }

    if (
      (cd.sections.length && scrollY + window.innerHeight < htmlElement.scrollHeight) ||
      backLinkLocation === 'bottom'
    ) {
      if (!this.$bottomLink) {
        this.$bottomLink = $('<li>')
          .attr('id', 'cd-pageNav-bottomLink')
          .addClass('cd-pageNav-item')
          .on('click', () => {
            this.jump(htmlElement.scrollHeight - window.innerHeight, this.$bottomLink);
          })
          .text(cd.s('pagenav-pagebottom'))
          .appendTo(this.$bottomElement);
      }
    } else {
      if (this.$bottomLink) {
        this.reset('bottom');
      }
    }

    // 1 as a threshold (also below, in "extendedRect.outerTop < BODY_SCROLL_PADDING_TOP + 1") works
    // better for Monobook for some reason (scroll to the first section using the page navigation to
    // see the difference).
    if (
      firstSectionOuterTop === undefined ||
      firstSectionOuterTop >= cd.g.BODY_SCROLL_PADDING_TOP + 1
    ) {
      if (currentSection) {
        this.resetSections();
      }
      return;
    }

    cd.sections
      .slice()
      .reverse()
      .some((section) => {
        const extendedRect = getExtendedRect(section.$heading.get(0));
        if (!getVisibilityByRects(extendedRect)) {
          return false;
        }

        if (extendedRect.outerTop < cd.g.BODY_SCROLL_PADDING_TOP + 1) {
          if (currentSection === section) {
            return true;
          }
          currentSection = section;

          // Keep the data
          $sectionWithBackLink?.detach();

          this.$currentSection.empty();
          const ancestors = [section, ...section.getAncestors()].reverse();
          ancestors.forEach((sectionInTree, level) => {
            const $item = (
              $sectionWithBackLink &&
              $sectionWithBackLink.data('section') === sectionInTree
            ) ?
              $sectionWithBackLink :
              $('<li>')
                .addClass(`cd-pageNav-item cd-pageNav-item-level-${level}`)
                .data('section', sectionInTree)
                .text(sectionInTree.headline)
                .on('click', () => {
                  this.jump(sectionInTree.$heading, $item);
                });
            $item.appendTo(this.$currentSection);
          });
          return true;
        }
        return false;
      });
  },

  /**
   * Reset the page navigation state partly or completely.
   *
   * @param {string} [part]
   */
  reset(part) {
    if (!part || part === 'top') {
      // Keep the data
      $sectionWithBackLink?.detach();

      this.$topElement.empty();
      this.$linksOnTop = null;
      this.$topLink = null;
      this.$tocLink = null;
      this.$currentSection = null;
      currentSection = null;
    }
    if (!part || part === 'bottom') {
      this.$bottomElement.empty();
      this.$bottomLink = null;
    }
    if (!part || part === backLinkLocation) {
      backLinkLocation = null;
      $backLinkContainer = null;
      $sectionWithBackLink = null;
    }
  },

  /**
   * Reset the current section variable and empty the contents of the current section block.
   */
  resetSections() {
    this.$currentSection.empty();
    currentSection = null;
  },

  jump($elementOrOffset, $link, isBackLink) {
    const offset = $elementOrOffset instanceof $ ?
      $elementOrOffset.offset().top - cd.g.BODY_SCROLL_PADDING_TOP :
      $elementOrOffset;
    if (!isBackLink && Math.abs(offset - window.scrollY) < 1) return;

    if (backLinkLocation) {
      backLinkLocation = null;
      $backLinkContainer.remove();
      $backLinkContainer = null;
      $sectionWithBackLink = null;
    }
    if (!isBackLink) {
      const scrollY = window.scrollY;
      const $backLink = $('<span>')
        .addClass('cd-pageNav-backLink')
        .text(cd.s('pagenav-back'))
        .on('click', (e) => {
          e.stopPropagation();
          this.jump(scrollY, $link, true);
        });
      $backLinkContainer = $('<span>')
        .addClass('cd-pageNav-backLinkContainer')
        .append(cd.sParse('dot-separator'), $backLink)
        .appendTo($link);
      if ($link.parent().is('#cd-pageNav-currentSection')) {
        $sectionWithBackLink = $link;
      }
      if ($link === this.$topLink || $link === this.$tocLink) {
        backLinkLocation = 'top';
      } else if ($link === this.$bottomLink) {
        backLinkLocation = 'bottom';
      } else {
        backLinkLocation = 'section';
      }
    }
    cd.g.isAutoScrollInProgress = true;
    $('body, html').animate({ scrollTop: offset }, {
      complete: () => {
        cd.g.isAutoScrollInProgress = false;
        handleScroll();
      },
    });
  },
};
