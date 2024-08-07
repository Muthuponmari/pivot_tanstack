import React, { useMemo, useState } from 'react';

import { useReactTable, getCoreRowModel, getExpandedRowModel, flexRender } from '@tanstack/react-table';

export default function PivotTable({ data }) {
    console.log(data);
    const [expandedGroups, setExpandedGroups] = useState([]);
    const [expanded, setExpanded] = React.useState({})
    const columns = useMemo(() => {
        function generateColumns(data, columnsMetadata, values, expandedGroups, toggleGroupExpansion, isTopLevel = true, parentId = '') {
            const [currentMeta, ...remainingMeta] = columnsMetadata;
            const uniqueValues = [...new Set(data.map(item => item[currentMeta.Id]))].sort();

            const columns = uniqueValues.map((value, index) => {
                const groupId = parentId ? `${parentId}_${currentMeta.Id}_${value}` : `${currentMeta.Id}_${value}`;
                const subItems = data.filter(item => item[currentMeta.Id] === value);
                const isExpanded = expandedGroups.includes(groupId);

                if (remainingMeta.length === 0) {
                    return {
                        header: value,
                        id: groupId,
                        columns: values.map(valueCol => ({
                            header: isTopLevel ? valueCol.Name : '',
                            id: `${groupId}_${valueCol.Id}`,
                            accessorFn: row => row[currentMeta.Id] === value ? row[valueCol.Id] : null,
                            aggregationFn: valueCol.AggregationFunction.toLowerCase(),
                        })),
                        enableGrouping: true
                    };
                }

                function calculateTotal(row, value, currentMeta) {
                    let rowValue = [];
                    if (Array.isArray(row.originalSubRows)) {
                        rowValue = row.originalSubRows.filter(item => item[currentMeta.Id] === value);
                    }
                    if (!row.originalSubRows) {
                        if (row.original && row.original[currentMeta.Id] === value) {
                            rowValue = [row.original];
                        }
                    }
                    const totalValue = rowValue.reduce((sum, item) => sum + item[values[0].Id], 0);
                    return totalValue;
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
                        const totalValue = calculateTotal(row, value, currentMeta);
                        return totalValue > 0 ? totalValue : '';
                    }
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
            setExpandedGroups(prev => {
                if (prev.includes(groupId)) {
                    // If the group is expanded, collapse it and all its subgroups
                    return prev.filter(id => !id.startsWith(groupId));
                } else {
                    // If the group is collapsed, expand it
                    return [...prev, groupId];
                }
            });
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
        const uniqueTopLevelValues = Array.from(new Set(data.Data.map(row => row[rowID]))).sort();

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

    const renderCell = React.useCallback((cell) => {
        const row = cell.row;
        if (cell.column.id === 'groupedColumn') {
            return (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ width: `${row.depth * 20}px` }}></span> {/* Add indentation */}
                    <button
                        onClick={() => row.toggleExpanded()}
                        style={{ cursor: 'pointer', marginRight: '5px' }}
                    >
                        {row.getIsExpanded() ? '▼' : '▶'}
                    </button>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
            )
        }
        return flexRender(cell.column.columnDef.cell, cell.getContext())
    }, [])

    return (
        <div style={{ height: '700px', overflow: 'auto', background: 'white' }}>
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
                                        border: '1px solid black'
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
                    {table.getRowModel().rows.map(row => (
                        <tr key={row.id}>
                            {row.getVisibleCells().map(cell => (
                                <td key={cell.id} style={{ border: '1px solid black', padding: '8px' }}>
                                    {renderCell(cell)}
                                </td>
                            ))}
                        </tr>
                    ))}
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