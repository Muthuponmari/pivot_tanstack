import React, { useMemo, useState, useCallback } from 'react';

import { useReactTable, getCoreRowModel, getExpandedRowModel, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';

export default function PivotTable({ data }) {
    console.log(data);
    const [expandedGroups, setExpandedGroups] = useState([]);
    const [expanded, setExpanded] = React.useState({})
    const valueAggregation = "Count of Sales Manager"

    const columns = useMemo(() => {
        function generateColumns(data, columnsMetadata, values, expandedGroups, toggleGroupExpansion, isTopLevel = true, parentId = '') {
            const [currentMeta, ...remainingMeta] = columnsMetadata;
            const uniqueValues = [...new Set(data.map(item => item[currentMeta.Id]))];

            const columns = uniqueValues.map((value, index) => {
                const groupId = parentId ? `${parentId}_${currentMeta.Id}_${value}` : `${currentMeta.Id}_${value}`;
                const subItems = data.filter(item => item[currentMeta.Id] === value);

                if (remainingMeta.length === 0) {
                    return {
                        header: value,
                        id: groupId,
                        columns: values.map(valueCol => ({
                            header: isTopLevel ? valueCol.Name : '',
                            id: `${groupId}_${valueCol.Id}`,
                            accessorFn: row => row[currentMeta.Id] === value ? row[valueCol.Id] : null,
                            aggregationFn: valueCol.AggregationFunction.toLowerCase(),
                            show: expandedGroups.includes(groupId)
                        })),
                        enableGrouping: true
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
                            {value} {expandedGroups.includes(groupId) ? '▼' : '▶'}
                        </div>
                    ),
                    id: groupId,
                    columns: subColumns,
                };
            });

            if (isTopLevel) {
                return [{
                    header: currentMeta.Name,
                    id: currentMeta.Id,
                    columns: columns
                }];
            }
            return columns;
        }

        const toggleGroupExpansion = (groupId) => {
            setExpandedGroups(prev =>
                prev.includes(groupId)
                    ? prev.filter(id => id !== groupId)
                    : [...prev, groupId]
            );
        };

        const baseColumn = {
            header: data.Rows[0].Name,
            accessorFn: (row) => row,
            id: 'groupedColumn',
            cell: ({ row, getValue }) => {
                const value = getValue();
                return value[data.Rows[row.depth].Id];
            },
        };

        const groupedColumns = generateColumns(data.Data, data.Columns, data.Values, expandedGroups, toggleGroupExpansion);

        return [baseColumn, ...groupedColumns];
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
        const uniqueTopLevelValues = Array.from(new Set(data.Data.map(row => row[rowID])));

        return uniqueTopLevelValues.map(topLevelValue => ({
            [rowID]: topLevelValue,
            subRows: data.Data.filter(row => row[rowID] === topLevelValue)
                .map(row => ({
                    ...row,
                    subRows: [{ ...row }]
                }))
        }));
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
    })

    const { rows } = table.getRowModel();

    const parentRef = React.useRef(null);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: useCallback(() => 35, []),
        overscan: 10,
    });

    const renderRow = React.useCallback((row) => {
        return (
            <React.Fragment key={row.id}>
                <tr>
                    {row.getVisibleCells().map(cell => (
                        <td key={cell.id} style={{ borderBottom: '1px solid #ddd', padding: '8px' }}>
                            {cell.column.id === 'groupedColumn' ? (
                                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: `${row.depth * 20}px` }}>
                                    {row.subRows?.length > 0 && (
                                        <button
                                            onClick={() => row.toggleExpanded()}
                                            style={{ cursor: 'pointer', marginRight: '5px' }}
                                        >
                                            {row.getIsExpanded() ? '▼' : '▶'}
                                        </button>
                                    )}
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </div>
                            ) : (
                                    flexRender(cell.column.columnDef.cell, cell.getContext())
                                )}
                        </td>
                    ))}
                </tr>
                {row.getIsExpanded() && row.subRows.map(subRow => renderRow(subRow))}
            </React.Fragment>
        )
    }, [])

    return (
        <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    style={{ border: '1px solid black', padding: '8px' }}
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
                    {table.getRowModel().rows.map(row => renderRow(row))}
                </tbody>
            </table>
        </div>
    )
}

const CustomHeader = ({ column }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {column.columnDef.header}
        <span>↓ ≡</span>
    </div>
);