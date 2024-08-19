import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useReactTable, getCoreRowModel, getExpandedRowModel, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function PivotTable({ data }) {
    const [expandedGroups, setExpandedGroups] = useState([]);
    const [expanded, setExpanded] = React.useState({})
    const tableContainerRef = useRef(null);


    const CustomHeader = ({ column }) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {column.columnDef.header}
        </div>
    );

    const toggleGroupExpansion = (groupId) => {
        setExpandedGroups(prev => {
            if (prev.includes(groupId)) {
                return prev.filter(id => !id.startsWith(groupId));
            } else {
                return [...prev, groupId];
            }
        });
    };

    const calculateTotal = function (row, groupId) {
        let parts = groupId.split('::');
        let criteria = {};
        for (let i = 0; i < parts.length; i += 2) {
            let key = parts[i];
            let value = parts[i + 1];
            criteria[key] = value;
        }
        if (!row.originalSubRows || row.originalSubRows.length === 0) {
            let matches = Object.keys(criteria).every(key => row.original[key] === criteria[key]);
            return matches ? row.original[data.Values[0].Id] || 0 : 0;
        }
        let rowValue = row.originalSubRows.filter(item => {
            return Object.keys(criteria).every(key => item[key] === criteria[key]);
        });

        const totalValue = rowValue.reduce((sum, item) => sum + (item[data.Values[0].Id] || 0), 0);
        return totalValue;
    }

    const generateColumns = function (data, columnsMetadata, values, expandedGroups, toggleGroupExpansion, isTopLevel = true, parentId = '') {
        const [currentMeta, ...remainingMeta] = columnsMetadata;
        const uniqueValues = [...new Set(data.map(item => item[currentMeta.Id]))].sort();

        const columns = uniqueValues.map((value, index) => {
            const groupId = parentId ? `${parentId}::${currentMeta.Id}::${value}` : `${currentMeta.Id}::${value}`;
            const subItems = data.filter(item => item[currentMeta.Id] === value);
            const isExpanded = expandedGroups.includes(groupId);

            if (remainingMeta.length === 0) {
                return {
                    header: value,
                    id: groupId,
                    accessorFn: (row) => row,
                    cell: ({ row, getValue }) => {
                        const totalValue = calculateTotal(row, groupId);
                        return totalValue > 0 ? totalValue : '';
                    }
                };
            }

            const subColumns = generateColumns(
                subItems,
                remainingMeta,
                values,
                expandedGroups,
                toggleGroupExpansion,
                false,
                groupId
            );

            return {
                header: () => (
                    <div
                        onClick={() => toggleGroupExpansion(groupId)}
                        style={{ cursor: 'pointer' }}
                    >
                        {value} {isExpanded ? '▼' : '▶'}
                    </div>
                ),
                id: groupId,
                columns: isExpanded ? subColumns : [],
                accessorFn: (row) => row,
                cell: ({ row, getValue }) => {
                    const totalValue = calculateTotal(row, groupId);
                    return totalValue > 0 ? totalValue : '';
                }
            };
        });

        if (isTopLevel) {
            const result = [{
                header: columnsMetadata.map((column, index) => (
                    <span key={index}>{column.Name}</span>
                )),
                id: currentMeta.Id,
                columns: columns
            }];

            // Add total column as a sibling at the last leaf level
            if (remainingMeta.length === 0) {
                result.push({
                    header: 'Total',
                    id: 'Total',
                    accessorFn: (row) => row,
                    cell: ({ row, getValue }) => {
                        const totalValue = calculateTotal(row, 'Total');
                        return totalValue > 0 ? totalValue : '';
                    }
                });
            }

            return result;
        }

        // Add total column as a sibling at the last leaf level
        if (remainingMeta.length === 0) {
            columns.push({
                header: 'Total',
                id: `${parentId}::Total`,
                accessorFn: (row) => row,
                cell: ({ row, getValue }) => {
                    const totalValue = calculateTotal(row, `${parentId}::Total`);
                    return totalValue > 0 ? totalValue : '';
                }
            });
        }

        return columns;
    }

    const calculateGrandTotalColumn = function (row) {
        let rowValue = [];

        if (row.originalSubRows && Array.isArray(row.originalSubRows)) {
            rowValue = row.originalSubRows;
        } else if (row.original) {
            // If it's a leaf node, use the original row data
            rowValue = [row.original];
        }

        const totalValue = rowValue.reduce((sum, item) => sum + (item[data.Values[0].Id] || 0), 0);
        return totalValue
    }

    const columns = useMemo(() => {
        const baseColumn = {
            header: <div>{
                data.Rows.map((row, index) => (
                    <div key={index}>{row.Name}</div>
                ))
            }</div>,
            accessorFn: (row) => row,
            id: 'groupedColumn',
            cell: ({ row, getValue }) => {
                const value = getValue();
                if (row.original.isGrandTotal) {
                    return <strong>Grand Total</strong>;
                }
                return value[data.Rows[row.depth].Id];
            },
        };
        const grandTotalColumn = {
            header: "Grand Total",
            accessorFn: (row) => row,
            id: 'TotalColumn',
            cell: ({ row, getValue }) => {
                const value = calculateGrandTotalColumn(row);
                return value
            },
        };
        const groupedColumns = generateColumns(data.Data, data.Columns, data.Values, expandedGroups, toggleGroupExpansion);
        return [baseColumn, ...groupedColumns, grandTotalColumn];
    }, [data, expandedGroups]);

    const visibleColumns = useMemo(() => {
        return columns.map(col => ({
            ...col,
            columns: col.columns ? col.columns.map(subCol => ({
                ...subCol,
                columns: expandedGroups.includes(subCol.id) ? subCol.columns : []
            })) : undefined
        }));
    }, [columns, expandedGroups]);

    const tableData = useMemo(() => {
        const rowID = data.Rows[0].Id;
        const uniqueTopLevelValues = Array.from(new Set(data.Data.map(row => row[rowID]))).sort();

        const regularRows = uniqueTopLevelValues.map(topLevelValue => ({
            [rowID]: topLevelValue,
            subRows: data.Data.filter(row => row[rowID] === topLevelValue)
                .map(row => ({
                    ...row,
                    subRows: [{ ...row }]
                }))
        }));

        // Add grand total row
        const grandTotalRow = {
            [rowID]: 'Grand Total',
            isGrandTotal: true,
            subRows: []
        };

        return [...regularRows, grandTotalRow];
    }, [data]);

    const table = useReactTable({
        data: tableData,
        columns: visibleColumns,
        state: {
            expanded
        },
        onExpandedChange: setExpanded,
        getSubRows: row => row.subRows,
        getExpandedRowModel: getExpandedRowModel(),
        getCoreRowModel: getCoreRowModel(),
        debugTable: true,
    });

    const rows = table.getRowModel().rows;

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => tableContainerRef.current,
        estimateSize: () => 35, // rowHeight
        overscan: 5, // overscanCount
    });

    const totalHeight = rowVirtualizer.getTotalSize();
    const virtualRows = rowVirtualizer.getVirtualItems();

    const paddingTop = virtualRows.length > 0 ? virtualRows?.[0]?.start || 0 : 0;
    const paddingBottom = virtualRows.length > 0 ? totalHeight - (virtualRows?.[virtualRows.length - 1]?.end || 0) : 0;

    const renderCell = useCallback((cell) => {
        const row = cell.row;
        if (cell.column.id === 'groupedColumn') {
            if (row.original.isGrandTotal) {
                return <strong>{flexRender(cell.column.columnDef.cell, cell.getContext())}</strong>;
            }
            return (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: `${row.depth * 20}px` }}></span>
                    {!row.original.isGrandTotal && (
                        <button
                            onClick={() => row.toggleExpanded()}
                            style={{ cursor: 'pointer', marginRight: '5px' }}
                        >
                            {row.getIsExpanded() ? '▼' : '▶'}
                        </button>
                    )}
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
            );
        }
        if (row.original.isGrandTotal) {
            // Calculate grand total for this column
            let parts = cell.column.id.split('::');
            let criteria = {};
            for (let i = 0; i < parts.length; i += 2) {
                let key = parts[i];
                let value = parts[i + 1];
                criteria[key] = value;
            }

            const grandTotal = tableData.reduce((sum, dataRow) => {
                if (!dataRow.isGrandTotal) {
                    const matchingSubRows = dataRow.subRows.filter(item =>
                        Object.keys(criteria).every(key => item[key] === criteria[key])
                    );

                    return sum + matchingSubRows.reduce((subSum, item) =>
                        subSum + (item[data.Values[0].Id] || 0), 0
                    );
                }
                return sum;
            }, 0);

            return <strong>{grandTotal}</strong>;
        }
        return flexRender(cell.column.columnDef.cell, cell.getContext());
    }, [tableData, data.Values]);

    return (
        <div
            ref={tableContainerRef}
            style={{
                height: '700px',
                overflow: 'auto',
                background: 'white',
            }}
        >
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    background: '#ddd',
                }}>
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    style={{
                                        padding: '8px',
                                        border: '1px solid black',
                                        textAlign: 'left'
                                    }}
                                >
                                    {header.isPlaceholder ? null :
                                        header.depth === 0 ?
                                            <CustomHeader column={header.column} /> :
                                            flexRender(header.column.columnDef.header, header.getContext())
                                    }
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody>
                    {paddingTop > 0 && (
                        <tr>
                            <td style={{ height: `${paddingTop}px` }} />
                        </tr>
                    )}
                    {virtualRows.map((virtualRow) => {
                        const row = rows[virtualRow.index];
                        return (
                            <tr
                                key={row.id}
                                style={{
                                    ...(row.original.isGrandTotal ? { fontWeight: 'bold', backgroundColor: '#f0f0f0' } : {})
                                }}
                            >
                                {row.getVisibleCells().map(cell => (
                                    <td key={cell.id} style={{ border: '1px solid black', padding: '8px' }}>
                                        {renderCell(cell)}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                    {paddingBottom > 0 && (
                        <tr>
                            <td style={{ height: `${paddingBottom}px` }} />
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}