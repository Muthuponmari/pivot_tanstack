import React, { useMemo, useState } from 'react';

import { useReactTable, getCoreRowModel, getExpandedRowModel, flexRender } from '@tanstack/react-table';

export default function PivotTable({ data }) {
    const [expandedGroups, setExpandedGroups] = useState([]);
    const [expanded, setExpanded] = React.useState({})

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

    const generateColumns = function (data, columnsMetadata, values, expandedGroups, toggleGroupExpansion, isTopLevel = true, parentId = '') {
        const [currentMeta, ...remainingMeta] = columnsMetadata;
        const uniqueValues = [...new Set(data.map(item => item[currentMeta.Id]))].sort();
        const calculateTotal = function (row, groupId) {
            let parts = groupId.split('-');
            let criteria = {};
            for (let i = 0; i < parts.length; i += 2) {
                let key = parts[i];
                let value = parts[i + 1];
                criteria[key] = value;
            }
            let value = parts[parts.length - 1];
            let columnId = parts[parts.length - 2];

            let rowValue = [];
            if (Array.isArray(row.originalSubRows)) {
                rowValue = row.originalSubRows.filter(item => {
                    return Object.keys(criteria).every(key => item[key] === criteria[key]);
                });
            }
            if (!row.originalSubRows) {
                if (row.original && row.original[columnId] === value) {
                    rowValue = [row.original];
                }
            }
            const totalValue = rowValue.reduce((sum, item) => sum + item[values[0].Id], 0);
            return totalValue;
        }

        const columns = uniqueValues.map((value, index) => {
            const groupId = parentId ? `${parentId}-${currentMeta.Id}-${value}` : `${currentMeta.Id}-${value}`;
            const subItems = data.filter(item => item[currentMeta.Id] === value);
            const isExpanded = expandedGroups.includes(groupId);

            if (remainingMeta.length === 0) {
                return {
                    header: value,
                    id: groupId,
                    columns: values.map(valueCol => ({
                        header: isTopLevel ? valueCol.Name : '',
                        id: `${groupId}_${valueCol.Id}`,
                        accessorFn: (row) => row,
                        cell: ({ row, getValue }) => {
                            const totalValue = calculateTotal(row, groupId);
                            return totalValue > 0 ? totalValue : '';
                        }
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
            return [{
                header: currentMeta.Name,
                id: currentMeta.Id,
                columns: columns
            }];
        }
        return columns;
    }

    const columns = useMemo(() => {
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