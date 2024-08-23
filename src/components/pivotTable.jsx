import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useReactTable, getCoreRowModel, getExpandedRowModel, flexRender } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Tooltip } from "./tooltip";
import '../index.css'

const CustomHeader = React.memo(({ column }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {column.columnDef.header}
    </div>
));

export default function PivotTable({ data }) {
    const [expandedGroups, setExpandedGroups] = useState([]);
    const [expanded, setExpanded] = React.useState({});
    const [tooltipData, setTooltipData] = useState(null);
    const tableContainerRef = useRef(null);

    const toggleGroupExpansion = (groupId) => {
        setExpandedGroups(prev => {
            if (prev.includes(groupId)) {
                return prev.filter(id => !id.startsWith(groupId));
            } else {
                return [...prev, groupId];
            }
        });
    };

    const handleTooltipShow = useCallback((rowData, columnId, rowDepth, value) => {
        setTooltipData({ rowData, columnId, rowDepth, value });
    }, []);

    const handleTooltipHide = useCallback(() => {
        setTooltipData(null);
    }, []);

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

    const generateLeafColumn = useCallback((value, groupId) => ({
        header: value,
        id: groupId,
        accessorFn: (row) => row,
        cell: ({ row, column }) => {
            const totalValue = calculateTotal(row, groupId);
            const isTooltipVisible = tooltipData &&
                tooltipData.columnId === column.id &&
                tooltipData.rowData === row.original;
            return (
                <div
                    onMouseEnter={() => handleTooltipShow(row.original, column.id, row.depth, totalValue)}
                    onMouseLeave={handleTooltipHide}
                    style={{ position: 'relative' }}
                >
                    {totalValue > 0 ? totalValue : ''}
                    {isTooltipVisible && <Tooltip rowData={tooltipData} rows={data.Rows} columns={data.Columns} />}
                </div>
            );
        }
    }), [calculateTotal, handleTooltipShow, handleTooltipHide, tooltipData]);

    const generateBranchColumn = useCallback((value, groupId, isExpanded, subColumns, toggleGroupExpansion) => ({
        header: ({ column }) => (
            <div onClick={() => toggleGroupExpansion(groupId)} style={{ cursor: 'pointer', color: '#545c6b' }}>
                <span style={{ color: '#545c6b' }}> {isExpanded ? '▼' : '▶'}</span> <span>{value}</span>
            </div>
        ),
        id: groupId,
        columns: isExpanded ? subColumns : [],
        accessorFn: (row) => row,
        cell: ({ row, column }) => {
            const totalValue = calculateTotal(row, groupId);
            const isTooltipVisible = tooltipData &&
                tooltipData.columnId === column.id &&
                tooltipData.rowData === row.original

            return (
                <div
                    onMouseEnter={() => handleTooltipShow(row.original, column.id, row.depth, totalValue)}
                    onMouseLeave={handleTooltipHide}
                    style={{ position: 'relative' }}
                >
                    {totalValue > 0 ? totalValue : ''}
                    {isTooltipVisible && <Tooltip rowData={tooltipData} rows={data.Rows} columns={data.Columns} />}
                </div>
            );
        }
    }), [calculateTotal, handleTooltipShow, handleTooltipHide, tooltipData]);

    const generateTotalColumn = (parentId = '') => ({
        header: 'Total',
        id: parentId ? `${parentId}::Total` : 'Total',
        accessorFn: (row) => row,
        cell: ({ row, column }) => {
            const totalValue = calculateTotal(row, parentId ? `${parentId}::Total` : 'Total');
            const columnId = column.id.split('::').slice(0, -1).join('::');
            const isTooltipVisible = tooltipData &&
                tooltipData.columnId === columnId &&
                tooltipData.rowData === row.original
            return (
                <div
                    onMouseEnter={() => handleTooltipShow(row.original, columnId, row.depth, totalValue)}
                    onMouseLeave={handleTooltipHide}
                    style={{ position: 'relative' }}
                >
                    {totalValue > 0 ? totalValue : ''}
                    {isTooltipVisible && <Tooltip rowData={tooltipData} rows={data.Rows} columns={data.Columns} />}
                </div>
            );
        }
    });

    const generateColumns = function (data, columnsMetadata, values, expandedGroups, toggleGroupExpansion, isTopLevel = true, parentId = '') {
        const [currentMeta, ...remainingMeta] = columnsMetadata;
        const uniqueValues = [...new Set(data.map(item => item[currentMeta.Id]))].sort();

        const columns = uniqueValues.map((value) => {
            const groupId = parentId ? `${parentId}::${currentMeta.Id}::${value}` : `${currentMeta.Id}::${value}`;
            const subItems = data.filter(item => item[currentMeta.Id] === value);
            const isExpanded = expandedGroups.includes(groupId);

            if (remainingMeta.length === 0) {
                return generateLeafColumn(value, groupId);
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

            return generateBranchColumn(value, groupId, isExpanded, subColumns, toggleGroupExpansion);
        });
        if (!isTopLevel) {
            columns.push(generateTotalColumn(parentId));
        }

        if (isTopLevel) {
            return [{
                header: columnsMetadata.map((column, index) => (
                    <span style={{ paddingRight: '20px' }} key={index}>{column.Name}</span>
                )),
                id: currentMeta.Id,
                columns: columns
            }];
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
    }, [data, expandedGroups, tooltipData]);

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
            expanded,
            tooltipData
        },
        enableColumnResizing: true,
        columnResizeMode: 'onChange',
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
                    {!row.original.isGrandTotal && row.subRows?.length > 0 && (
                        <div
                            onClick={() => row.toggleExpanded()}
                            style={{ cursor: 'pointer', marginRight: '5px' }}
                        >
                            {row.getIsExpanded() ? '▼' : '▶'}
                        </div>
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
    }, [tooltipData, tableData, data.Values]);

    return (
        <div
            ref={tableContainerRef}
            style={{
                height: '700px',
                overflow: 'auto',
                background: 'white',
            }}
        >
            <table style={{ borderCollapse: 'collapse', width: '100%', color: '#282B2F' }}>
                <thead style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    background: '#ffffff',
                    border: '1px solid #f0f3f7',
                }}>
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    style={{
                                        padding: '8px',
                                        border: '1px solid #f0f3f7',
                                        textAlign: 'left',
                                        minWidth: `${header.column.getSize()}px`,
                                        width: `${header.column.getSize()}px`,
                                    }}
                                >
                                    {header.isPlaceholder ? null :
                                        header.depth === 0 ?
                                            <CustomHeader column={header.column} /> :
                                            flexRender(header.column.columnDef.header, header.getContext())
                                    }
                                    {header.column.getCanResize() && (
                                        <div
                                            onMouseDown={header.getResizeHandler()}
                                            onTouchStart={header.getResizeHandler()}
                                            className={`resizer ${
                                                header.column.getIsResizing() ? 'isResizing' : ''
                                                }`}
                                        ></div>
                                    )}
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
                                    <td key={cell.id} style={{ border: '1px solid #f0f3f7', padding: '8px' }}>
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