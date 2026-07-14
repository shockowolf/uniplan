import { describe, expect, it } from 'vitest';
import { buildMenuTree, isInternalMenuHref } from '@/lib/navigation';

describe('native recursive navigation', () => {
  it('sorts every recursive level deterministically', () => {
    const menuTree = buildMenuTree([
      {
        id: 'child-b',
        parentId: 'root',
        code: 'b',
        label: 'B',
        href: '/b',
        sortOrder: 20,
      },
      {
        id: 'grandchild',
        parentId: 'child-a',
        code: 'grandchild',
        label: 'Grandchild',
        href: '/a/detail',
        sortOrder: 1,
      },
      {
        id: 'root',
        parentId: null,
        code: 'root',
        label: 'Root',
        href: '/root',
        sortOrder: 10,
      },
      {
        id: 'child-a',
        parentId: 'root',
        code: 'a',
        label: 'A',
        href: '/a',
        sortOrder: 10,
      },
    ]);
    expect(menuTree).toEqual([
      {
        code: 'root',
        label: 'Root',
        href: '/root',
        children: [
          {
            code: 'a',
            label: 'A',
            href: '/a',
            children: [
              { code: 'grandchild', label: 'Grandchild', href: '/a/detail' },
            ],
          },
          { code: 'b', label: 'B', href: '/b' },
        ],
      },
    ]);
  });

  it.each([
    'https://outside.example',
    '//outside.example',
    '/bad path',
    'javascript:alert(1)',
    '',
  ])('rejects malformed or external href %s', (href) => {
    expect(isInternalMenuHref(href)).toBe(false);
  });

  it('drops invalid rows from a menu tree', () => {
    expect(
      buildMenuTree([
        {
          id: 'bad',
          parentId: null,
          code: 'bad',
          label: 'Bad',
          href: 'https://outside.example',
          sortOrder: 1,
        },
      ]),
    ).toEqual([]);
  });
});
