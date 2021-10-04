import * as md from '../markdown';
import * as notion from '../notion';

function parseInline(
  element: md.PhrasingContent,
  options?: notion.RichTextOptions
): notion.RichText[] {
  const copy = {
    annotations: {
      ...(options?.annotations ?? {}),
    },
    url: options?.url,
  };

  switch (element.type) {
    case 'image':
      return [notion.richText(element.title ?? element.url, copy)];

    case 'text':
      return [notion.richText(element.value, copy)];

    case 'delete':
      copy.annotations.strikethrough = true;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'emphasis':
      copy.annotations.italic = true;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'strong':
      copy.annotations.bold = true;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'link':
      copy.url = element.url;
      return element.children.flatMap(child => parseInline(child, copy));

    case 'inlineCode':
      copy.annotations.code = true;
      return [notion.richText(element.value, copy)];

    default:
      return [];
  }
}

function parseImage(element: md.PhrasingContent): notion.ImageBlock {
  if (element.type === 'image') {
    return notion.image(element.url);
  }
  return notion.image('');
}

type Paragraph = {
  type: 'rich-text' | 'image';
  value: any;
};
function parseParagraph(
  element: md.Paragraph
): (notion.ParagraphBlock | notion.ImageBlock)[] {
  const paragraph = element.children.flatMap(child => {
    const type = child.type === 'image' ? 'image' : 'rich-text';
    const value =
      child.type === 'image' ? parseImage(child) : parseInline(child);

    return {
      type,
      value,
    };
  }) as Paragraph[];

  return paragraph.reduce((acc, p, index) => {
    const {type, value} = p;
    const groupCount = acc.length;
    const firstGroups = acc.slice(0, groupCount - 1);
    const lastGroup = acc[groupCount - 1] || [];

    if (type === 'image') {
      if (paragraph[index - 1]?.type === 'rich-text')
        return [...firstGroups, notion.paragraph(lastGroup), value];
      return [...firstGroups, lastGroup, value];
    }

    if (paragraph[index - 1]?.type === 'image')
      return [...firstGroups, lastGroup, [value]];
    return [...firstGroups, [...lastGroup, value]];
  }, [] as any[]);
}

function parseHeading(
  element: md.Heading
): notion.HeadingOneBlock | notion.HeadingTwoBlock | notion.HeadingThreeBlock {
  const text = element.children.flatMap(child => parseInline(child));

  switch (element.depth) {
    case 1:
      return notion.headingOne(text);

    case 2:
      return notion.headingTwo(text);

    default:
      return notion.headingThree(text);
  }
}

function parseCode(element: md.Code): notion.ParagraphBlock {
  const text = [notion.richText(element.value, {annotations: {code: true}})];
  return notion.paragraph(text);
}

function parseList(
  element: md.List
): (
  | notion.BulletedListItemBlock
  | notion.NumberedListItemBlock
  | notion.ToDoBlock
)[] {
  return element.children.flatMap(item => {
    const paragraph = item.children[0];
    if (paragraph.type !== 'paragraph') {
      return [] as (
        | notion.BulletedListItemBlock
        | notion.NumberedListItemBlock
        | notion.ToDoBlock
      )[];
    }

    const text = paragraph.children.flatMap(child => parseInline(child));

    if (element.start !== null && element.start !== undefined) {
      return [notion.numberedListItem(text)];
    } else if (item.checked !== null && item.checked !== undefined) {
      return [notion.toDo(item.checked, text)];
    } else {
      return [notion.bulletedListItem(text)];
    }
  });
}

function parseNode(node: md.FlowContent): (notion.Block | notion.ImageBlock)[] {
  switch (node.type) {
    case 'heading':
      return [parseHeading(node)];

    case 'paragraph':
      return [...parseParagraph(node)];

    case 'code':
      return [parseCode(node)];

    case 'blockquote':
      return node.children.flatMap(parseNode);

    case 'list':
      return parseList(node);

    default:
      return [];
  }
}

export function parseBlocks(
  root: md.Root
): (notion.Block | notion.ImageBlock)[] {
  return root.children.flatMap(parseNode);
}

export function parseRichText(root: md.Root): notion.RichText[] {
  if (root.children.length !== 1 || root.children[0].type !== 'paragraph') {
    throw new Error(`Unsupported markdown element: ${JSON.stringify(root)}`);
  }

  const paragraph = root.children[0];
  return paragraph.children.flatMap(child => parseInline(child));
}
