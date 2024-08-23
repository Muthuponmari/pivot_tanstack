import React from 'react';
import PropTypes from 'prop-types';

export const Tooltip = React.memo(({ rowData, rows, columns }) => {
    const { rowDepth, columnId, value } = rowData;

    const key = rows[rowDepth].Id;
    const firstRowName = rows[rowDepth].Name;
    const result = rowData.rowData[key];

    const [secondColumnId, secondColumnName] = columnId.split('::').slice(-2);

    const getNameById = React.useCallback((id) => {
        const matchedObject = columns.find(obj => obj.Id === secondColumnId);
        return matchedObject ? matchedObject.Name : null;
    }, [columns]);

    const secondRowName = getNameById(columnId);

    return (
        <div id="tooltip"
            style={{
                position: 'absolute',
                backgroundColor: 'black',
                color: 'white',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '14px',
                zIndex: 100,
                left: '100%',
                marginLeft: '8px',
                whiteSpace: 'nowrap',
            }}
        >
            <p>{firstRowName}: {result}</p>
            <p>{secondRowName}: {secondColumnName}</p>
            <p>Count of Sales manager: {value}</p>
        </div>
    );
});

Tooltip.propTypes = {
    rowData: PropTypes.shape({
        rowDepth: PropTypes.number.isRequired,
        columnId: PropTypes.string.isRequired,
        value: PropTypes.number.isRequired,
        rowData: PropTypes.object.isRequired,
    }).isRequired,
    rows: PropTypes.array.isRequired,
    columns: PropTypes.array.isRequired,
};

