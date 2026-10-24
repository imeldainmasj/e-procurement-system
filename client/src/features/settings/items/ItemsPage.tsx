import { useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { cn } from '@/utils/cn';
import { CategoriesTab } from './CategoriesTab';
import { ItemsTab } from './ItemsTab';

type Tab = 'items' | 'categories';

export function ItemsPage() {
  const [tab, setTab] = useState<Tab>('items');

  return (
    <>
      <PageHeader title="Katalog Item" description="Master barang & jasa IT yang dapat diajukan." />
      <div role="tablist" className="tabs tabs-border mb-4">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'items'}
          className={cn('tab', tab === 'items' && 'tab-active')}
          onClick={() => setTab('items')}
        >
          Item
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'categories'}
          className={cn('tab', tab === 'categories' && 'tab-active')}
          onClick={() => setTab('categories')}
        >
          Kategori
        </button>
      </div>
      {tab === 'items' ? <ItemsTab /> : <CategoriesTab />}
    </>
  );
}
