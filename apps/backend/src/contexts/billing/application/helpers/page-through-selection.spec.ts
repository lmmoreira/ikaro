import { pageThroughSelection } from './page-through-selection';

// A page of 2, so paging is reachable with a handful of rows.
jest.mock('../../domain/billing-constants', () => ({
  ...jest.requireActual('../../domain/billing-constants'),
  BILLING_JOB_PAGE_SIZE: 2,
}));

interface Row {
  id: number;
}

const rows = (count: number): Row[] => Array.from({ length: count }, (_, i) => ({ id: i + 1 }));

// A keyset over `all`: the rows after `after`, at most one page.
const selection =
  (all: Row[]) =>
  async (after?: Row): Promise<Row[]> =>
    all.filter((row) => after === undefined || row.id > after.id).slice(0, 2);

describe('pageThroughSelection', () => {
  it('works every page, each starting after the last row of the one before', async () => {
    const pages: number[][] = [];

    await pageThroughSelection<Row>({
      fetch: selection(rows(5)),
      onPage: async (page) => {
        pages.push(page.map((row) => row.id));
      },
      onFailure: () => undefined,
    });

    expect(pages).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('stops after a short page and never asks for one more', async () => {
    const fetch = jest.fn(selection(rows(3)));

    await pageThroughSelection<Row>({
      fetch,
      onPage: async () => undefined,
      onFailure: () => undefined,
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports a page that cannot be read and ends the selection without working it', async () => {
    const onPage = jest.fn().mockResolvedValue(undefined);
    const onFailure = jest.fn();
    const error = new Error('read failed');

    await pageThroughSelection<Row>({
      fetch: jest.fn().mockRejectedValue(error),
      onPage,
      onFailure,
    });

    expect(onPage).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith(error, 'SELECTION');
  });

  it('reports a page that cannot be worked and still reads the pages after it', async () => {
    const worked: number[][] = [];
    const onFailure = jest.fn();
    const error = new Error('work failed');

    await pageThroughSelection<Row>({
      fetch: selection(rows(4)),
      onPage: async (page) => {
        if (page[0]?.id === 1) throw error;
        worked.push(page.map((row) => row.id));
      },
      onFailure,
    });

    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(onFailure).toHaveBeenCalledWith(error, 'PAGE');
    expect(worked).toEqual([[3, 4]]);
  });
});
